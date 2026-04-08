/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF, like before)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Multiple results may be emitted (one per agent teams result).
 *   Final marker after loop ends signals completion.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import {
  query,
  HookCallback,
  PreCompactHookInput,
} from '@anthropic-ai/claude-agent-sdk';
import { fileURLToPath } from 'url';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  script?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

/**
 * Push-based async iterable for streaming user messages to the SDK.
 * Keeps the iterable alive until end() is called, preventing isSingleUserTurn.
 */
class MessageStream {
  private queue: SDKUserMessage[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string): void {
    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    });
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.done) return;
      await new Promise<void>((r) => {
        this.waiting = r;
      });
      this.waiting = null;
    }
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function getSessionSummary(
  sessionId: string,
  transcriptPath: string,
): string | null {
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    log(`Sessions index not found at ${indexPath}`);
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(
      fs.readFileSync(indexPath, 'utf-8'),
    );
    const entry = index.entries.find((e) => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch (err) {
    log(
      `Failed to read sessions index: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return null;
}

/**
 * Pipeline tracker hooks — emit IPC files so the host writes
 * pipeline_executions / pipeline_stages rows that the dashboard displays.
 *
 * Each Task tool invocation (sub-agent spawn) becomes a stage; the final
 * session Stop closes the execution. State is kept per session in
 * /workspace/ipc/pipelines-state/<session>.json to compute stage positions
 * and total_stages.
 */
function deriveOfficeFromGroupFolder(folder: string): string {
  const m = folder.match(/^(?:telegram|whatsapp|slack|discord)_(.+)$/);
  return m ? m[1] : folder;
}

/**
 * Write a cost record to /workspace/ipc/costs/ in the format the host
 * orchestrator (src/ipc.ts processCostFile) expects. The host watcher picks
 * up the file, computes BRL cost from the model+token data and inserts a row
 * into the agent_costs table.
 *
 * Until now this was only ever called by the `report_token_usage` MCP tool —
 * which the LLM had to choose to invoke. As a result only the innovation
 * office (whose orchestrator happened to call it) had any cost history. The
 * agent-runner now writes one of these files automatically every time the
 * SDK emits a `result` message, using the per-model usage data the SDK
 * already provides for free, so all offices get accurate accounting without
 * any prompt-engineering.
 */
function writeCostRecord(record: {
  agent_name: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  container_name: string;
  cost_usd?: number;
}): void {
  const costsDir = '/workspace/ipc/costs';
  try {
    fs.mkdirSync(costsDir, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const tempPath = path.join(costsDir, `${filename}.tmp`);
    const finalPath = path.join(costsDir, filename);
    const payload = {
      type: 'token_usage',
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      ...record,
    };
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
    fs.renameSync(tempPath, finalPath);
  } catch (err) {
    log(`[cost] Failed to write cost record: ${(err as Error).message}`);
  }
}

function readPipelineState(sessionId: string): {
  nextPosition: number;
  totalStages: number;
  lastPosition: number;
} {
  try {
    return JSON.parse(
      fs.readFileSync(
        `/workspace/ipc/pipelines-state/${sessionId}.json`,
        'utf-8',
      ),
    );
  } catch {
    return { nextPosition: 1, totalStages: 0, lastPosition: 0 };
  }
}

function writePipelineState(sessionId: string, state: unknown): void {
  try {
    fs.mkdirSync('/workspace/ipc/pipelines-state', { recursive: true });
    fs.writeFileSync(
      `/workspace/ipc/pipelines-state/${sessionId}.json`,
      JSON.stringify(state),
    );
  } catch (err) {
    log(`Pipeline tracker: failed to write state: ${(err as Error).message}`);
  }
}

function countOfficeAgents(office: string): number {
  try {
    return fs
      .readdirSync(`/workspace/offices/${office}/agents`)
      .filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

function listOfficeAgentSlugs(office: string): string[] {
  try {
    return fs
      .readdirSync(`/workspace/offices/${office}/agents`)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

interface AgentFrontmatter {
  name?: string;
  description?: string;
  model?: string;
  tools?: string;
  skill?: string;
  skills?: string;
}

function parseAgentFile(filePath: string): {
  frontmatter: AgentFrontmatter;
  body: string;
} {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { frontmatter: {}, body: '' };
  }
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: raw };
  const fm: AgentFrontmatter = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      (fm as any)[k] = v;
    }
  }
  return { frontmatter: fm, body: m[2].trim() };
}

/**
 * Load every sub-agent identity file from `/workspace/offices/<office>/agents/`
 * and translate it into the `AgentDefinition` shape the Claude Agent SDK
 * expects, so the orchestrator can spawn them via the `Agent` tool with the
 * agent's slug as `subagent_type`.
 *
 * The SDK does NOT auto-discover agents from `~/.claude/agents/`; they must
 * be passed explicitly via the `agents` option of `query()`.
 */
function loadOfficeAgents(
  office: string,
): Record<string, { description: string; prompt: string; model?: string }> {
  const result: Record<string, { description: string; prompt: string; model?: string }> = {};
  const dir = `/workspace/offices/${office}/agents`;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return result;
  }
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const { frontmatter, body } = parseAgentFile(path.join(dir, file));
    if (!body) continue;
    const description =
      frontmatter.description ||
      `${slug.replace(/-/g, ' ')} agent of the ${office} office. See identity file for full role.`;
    const def: { description: string; prompt: string; model?: string } = {
      description,
      prompt: body,
    };
    if (frontmatter.model && frontmatter.model !== 'inherit') {
      def.model = frontmatter.model;
    }
    result[slug] = def;
  }
  return result;
}

/**
 * Tools the office orchestrator (main thread) is allowed to call directly.
 * Anything else MUST be delegated to a named sub-agent. Subagents themselves
 * are unrestricted by this guard — they need Bash, Edit, etc. to do real work.
 */
const ORCHESTRATOR_ALLOWED_TOOLS = new Set<string>([
  'Agent',
  'Task',
  'TaskOutput',
  'TaskStop',
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'TodoWrite',
  'ToolSearch',
  'Read', // further filtered: identity file reads also become active-agent signals
  'Skill',
]);

function writeActiveAgent(
  office: string,
  subagent: string,
  sessionId: string,
  source: string,
): void {
  try {
    fs.writeFileSync(
      '/workspace/ipc/active-agent.json',
      JSON.stringify({
        office,
        subagent,
        session_id: sessionId,
        started_at: new Date().toISOString(),
        source,
      }),
    );
  } catch (err) {
    log(`Active-agent write failed: ${(err as Error).message}`);
  }
}

/**
 * Runtime guard for sub-agent delegation.
 *
 * This hook is the enforcement mechanism for the office's "## Execution rules"
 * section. It runs on every PreToolUse and applies two policies:
 *
 * 1. **Spawn-tool validation** (`Agent` / `Task`): the `subagent_type` MUST
 *    name a real file in `/workspace/offices/<office>/agents/`. The generic
 *    `general-purpose` subagent is rejected. On a valid call we record the
 *    active agent so the dashboard can highlight it.
 *
 * 2. **Orchestrator-thread restriction**: when the call comes from the main
 *    thread (no `agent_id`), only the orchestration tools listed in
 *    `ORCHESTRATOR_ALLOWED_TOOLS` (and `mcp__*` MCP tools) are permitted. Any
 *    work tool — `Bash`, `Edit`, `Write`, `WebFetch`, `WebSearch`, `Grep`,
 *    `Glob`, etc. — is denied with a message instructing the orchestrator to
 *    delegate via the `Agent` tool. Sub-agents (which carry an `agent_id`)
 *    are unaffected and can do whatever work they need.
 *
 * Reads of identity files at `/workspace/offices/<office>/agents/<slug>.md`
 * are always allowed and ALSO recorded as an active-agent signal — that
 * covers offices whose orchestrators "become" an agent inline instead of
 * spawning one.
 *
 * Offices without any agent files (`/workspace/offices/<office>/agents/`
 * empty or missing) are exempt from both policies — useful for free-form
 * groups.
 */
function createDelegationGuardHook(office: string): HookCallback {
  return async (input, _toolUseId, _context) => {
    try {
      const evt = input as {
        hook_event_name?: string;
        tool_name?: string;
        tool_input?: {
          subagent_type?: string;
          description?: string;
          file_path?: string;
        };
        session_id?: string;
        agent_id?: string;
      };

      const validSlugs = listOfficeAgentSlugs(office);
      // Free-form office: no enforcement.
      if (validSlugs.length === 0) return {};

      const tool = evt.tool_name || '';
      const sessionId = evt.session_id || 'unknown';
      const isMainThread = !evt.agent_id;

      // ----- Spawn-tool validation (applies on main thread AND inside subagents) -----
      if (tool === 'Agent' || tool === 'Task') {
        const sub = (evt.tool_input?.subagent_type || '').trim();
        if (!validSlugs.includes(sub)) {
          const list = validSlugs.map((s) => `- ${s}`).join('\n');
          const reason =
            `Delegation rejected: subagent_type "${sub || '(missing)'}" is not a valid agent of the ${office} office.\n\n` +
            `You MUST set subagent_type to one of:\n${list}\n\n` +
            `These are the kebab-case filenames in /workspace/offices/${office}/agents/. ` +
            `The "general-purpose" subagent is forbidden in this office. ` +
            `Before retrying, Read the identity file of the agent you are about to delegate to.`;
          log(`Delegation guard: BLOCK spawn subagent_type="${sub}" main=${isMainThread}`);
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: reason,
            },
          };
        }
        writeActiveAgent(office, sub, sessionId, 'agent-tool');
        log(`Delegation guard: PASS spawn subagent_type="${sub}"`);
        return {};
      }

      // ----- Subagent threads: unrestricted (they need to do the actual work) -----
      if (!isMainThread) return {};

      // ----- Read on the main thread: always allow, capture identity reads -----
      if (tool === 'Read') {
        const fp = evt.tool_input?.file_path;
        const m = fp?.match(
          /\/workspace\/offices\/[^/]+\/agents\/([^/]+)\.md$/,
        );
        if (m) {
          writeActiveAgent(office, m[1], sessionId, 'role-read');
          log(`Delegation guard: active-agent via Read ${m[1]}`);
        }
        return {};
      }

      // ----- Orchestrator allow-list: orchestration + MCP -----
      if (ORCHESTRATOR_ALLOWED_TOOLS.has(tool) || tool.startsWith('mcp__')) {
        return {};
      }

      // ----- Everything else on main thread is blocked -----
      const list = validSlugs.map((s) => `- ${s}`).join('\n');
      const reason =
        `Tool "${tool}" is NOT allowed on the orchestrator thread of the ${office} office.\n\n` +
        `As the orchestrator you must NEVER do work yourself. Delegate it to a sub-agent.\n\n` +
        `Required protocol:\n` +
        `1. Read the identity file: /workspace/offices/${office}/agents/<slug>.md\n` +
        `2. Invoke the Agent tool with subagent_type=<slug> (one of:\n${list}\n).\n` +
        `3. Pass the work instructions in the prompt field. The sub-agent will run ${tool} for you.\n\n` +
        `Allowed orchestrator tools: Agent, Read, TodoWrite, ToolSearch, SendMessage, Skill, mcp__nanoclaw__*.`;
      log(`Delegation guard: BLOCK main-thread tool="${tool}"`);
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      };
    } catch (err) {
      log(`Delegation guard error: ${(err as Error).message}`);
    }
    return {};
  };
}

function emitPipelineEvent(record: Record<string, unknown>): void {
  try {
    fs.mkdirSync('/workspace/ipc/pipelines', { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    fs.writeFileSync(
      `/workspace/ipc/pipelines/${name}`,
      JSON.stringify(record),
    );
  } catch (err) {
    log(`Pipeline tracker: failed to emit event: ${(err as Error).message}`);
  }
}

function createPipelinePreTaskHook(
  office: string,
  chatJid: string,
): HookCallback {
  return async (input, _toolUseId, _context) => {
    try {
      const evt = input as {
        hook_event_name?: string;
        tool_name?: string;
        tool_input?: { subagent_type?: string; description?: string };
        session_id?: string;
      };
      const sessionId = evt.session_id || 'unknown';

      // The Development office (and others) don't actually call the Task
      // tool — instead the orchestrator "becomes" an agent by Read-ing
      // /workspace/offices/<office>/agents/<slug>.md. Treat that read as
      // an active-agent signal too.
      if (evt.tool_name === 'Read') {
        const filePath: string | undefined = (evt.tool_input as { file_path?: string })?.file_path;
        const m = filePath?.match(
          /\/workspace\/offices\/[^/]+\/agents\/([^/]+)\.md$/,
        );
        if (m) {
          const slug = m[1];
          try {
            fs.writeFileSync(
              '/workspace/ipc/active-agent.json',
              JSON.stringify({
                office,
                subagent: slug,
                session_id: sessionId,
                started_at: new Date().toISOString(),
                source: 'role-read',
              }),
            );
            log(`Active-agent: assumed role ${slug} via Read`);
          } catch (err) {
            log(`Active-agent: failed to write (Read): ${(err as Error).message}`);
          }
        }
        return {};
      }

      if (evt.tool_name !== 'Task' && evt.tool_name !== 'Agent') return {};
      const subagent =
        evt.tool_input?.subagent_type ||
        evt.tool_input?.description ||
        'subagent';

      const state = readPipelineState(sessionId);
      if (!state.totalStages) state.totalStages = countOfficeAgents(office);

      const position = state.nextPosition;
      state.nextPosition = position + 1;
      state.lastPosition = position;
      writePipelineState(sessionId, state);

      emitPipelineEvent({
        execution_id: `pipe-${sessionId}`,
        stage: position,
        total_stages: state.totalStages,
        status: position === 1 ? 'started' : 'running',
        agent_name: subagent,
        chat_jid: chatJid,
        triggered_by: office,
        started_at: new Date().toISOString(),
      });

      // Mark this subagent as the office's currently active agent so the
      // dashboard can show *which* agent is working (not just the office).
      try {
        fs.writeFileSync(
          '/workspace/ipc/active-agent.json',
          JSON.stringify({
            office,
            subagent,
            session_id: sessionId,
            started_at: new Date().toISOString(),
          }),
        );
      } catch (err) {
        log(`Pipeline tracker: failed to write active-agent: ${(err as Error).message}`);
      }

      log(`Pipeline tracker: stage ${position} started (${subagent})`);
    } catch (err) {
      log(`Pipeline tracker PreToolUse error: ${(err as Error).message}`);
    }
    return {};
  };
}

function createPipelineStopHook(office: string, chatJid: string): HookCallback {
  return async (input, _toolUseId, _context) => {
    try {
      const evt = input as { session_id?: string };
      const sessionId = evt.session_id || 'unknown';
      const state = readPipelineState(sessionId);
      if (state.lastPosition > 0) {
        emitPipelineEvent({
          execution_id: `pipe-${sessionId}`,
          stage: state.lastPosition,
          total_stages: state.totalStages,
          status: 'completed',
          agent_name: 'pipeline',
          chat_jid: chatJid,
          triggered_by: office,
          completed_at: new Date().toISOString(),
        });
        log(`Pipeline tracker: execution closed at stage ${state.lastPosition}`);
      }
      try {
        fs.rmSync('/workspace/ipc/active-agent.json', { force: true });
      } catch {
        /* ignore */
      }
    } catch (err) {
      log(`Pipeline tracker Stop error: ${(err as Error).message}`);
    }
    return {};
  };
}

/**
 * Archive the full transcript to conversations/ before compaction.
 */
function createPreCompactHook(assistantName?: string): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preCompact = input as PreCompactHookInput;
    const transcriptPath = preCompact.transcript_path;
    const sessionId = preCompact.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      log('No transcript found for archiving');
      return {};
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);

      if (messages.length === 0) {
        log('No messages to archive');
        return {};
      }

      const summary = getSessionSummary(sessionId, transcriptPath);
      const name = summary ? sanitizeFilename(summary) : generateFallbackName();

      const conversationsDir = '/workspace/group/conversations';
      fs.mkdirSync(conversationsDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const filename = `${date}-${name}.md`;
      const filePath = path.join(conversationsDir, filename);

      const markdown = formatTranscriptMarkdown(
        messages,
        summary,
        assistantName,
      );
      fs.writeFileSync(filePath, markdown);

      log(`Archived conversation to ${filePath}`);
    } catch (err) {
      log(
        `Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {};
  };
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text =
          typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content
                .map((c: { text?: string }) => c.text || '')
                .join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {}
  }

  return messages;
}

function formatTranscriptMarkdown(
  messages: ParsedMessage[],
  title?: string | null,
  assistantName?: string,
): string {
  const now = new Date();
  const formatDateTime = (d: Date) =>
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : assistantName || 'Assistant';
    const content =
      msg.content.length > 2000
        ? msg.content.slice(0, 2000) + '...'
        : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check for _close sentinel.
 */
function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try {
      fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

/**
 * Drain all pending IPC input messages.
 * Returns messages found, or empty array.
 */
function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs
      .readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(
          `Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 * Returns the messages as a single string, or null if _close.
 */
function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

/**
 * Run a single query and stream results via writeOutput.
 * Uses MessageStream (AsyncIterable) to keep isSingleUserTurn=false,
 * allowing agent teams subagents to run to completion.
 * Also pipes IPC messages into the stream during the query.
 */
async function runQuery(
  prompt: string,
  sessionId: string | undefined,
  mcpServerPath: string,
  containerInput: ContainerInput,
  sdkEnv: Record<string, string | undefined>,
  resumeAt?: string,
): Promise<{
  newSessionId?: string;
  lastAssistantUuid?: string;
  closedDuringQuery: boolean;
}> {
  const stream = new MessageStream();
  stream.push(prompt);

  // Poll IPC for follow-up messages and _close sentinel during the query
  let ipcPolling = true;
  let closedDuringQuery = false;
  const pollIpcDuringQuery = () => {
    if (!ipcPolling) return;
    if (shouldClose()) {
      log('Close sentinel detected during query, ending stream');
      closedDuringQuery = true;
      stream.end();
      ipcPolling = false;
      return;
    }
    const messages = drainIpcInput();
    for (const text of messages) {
      log(`Piping IPC message into active query (${text.length} chars)`);
      stream.push(text);
    }
    setTimeout(pollIpcDuringQuery, IPC_POLL_MS);
  };
  setTimeout(pollIpcDuringQuery, IPC_POLL_MS);

  let newSessionId: string | undefined;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;
  let resultCount = 0;

  // Load global CLAUDE.md as additional system context (shared across all groups)
  const globalClaudeMdPath = '/workspace/global/CLAUDE.md';
  let globalClaudeMd: string | undefined;
  if (!containerInput.isMain && fs.existsSync(globalClaudeMdPath)) {
    globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
  }

  // Discover additional directories mounted at /workspace/extra/*
  // These are passed to the SDK so their CLAUDE.md files are loaded automatically
  const extraDirs: string[] = [];
  const extraBase = '/workspace/extra';
  if (fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        extraDirs.push(fullPath);
      }
    }
  }
  if (extraDirs.length > 0) {
    log(`Additional directories: ${extraDirs.join(', ')}`);
  }

  // Load per-office sub-agent definitions so the orchestrator can delegate
  // via the Agent tool using the agent's kebab-case slug.
  const officeAgents = loadOfficeAgents(
    deriveOfficeFromGroupFolder(containerInput.groupFolder),
  );
  log(
    `Loaded ${Object.keys(officeAgents).length} office sub-agents: ${Object.keys(officeAgents).join(', ') || '(none)'}`,
  );

  for await (const message of query({
    prompt: stream,
    options: {
      cwd: '/workspace/group',
      additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
      resume: sessionId,
      resumeSessionAt: resumeAt,
      agents: Object.keys(officeAgents).length > 0 ? officeAgents : undefined,
      systemPrompt: globalClaudeMd
        ? {
            type: 'preset' as const,
            preset: 'claude_code' as const,
            append: globalClaudeMd,
          }
        : undefined,
      allowedTools: [
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        'Task',
        'TaskOutput',
        'TaskStop',
        'TeamCreate',
        'TeamDelete',
        'SendMessage',
        'TodoWrite',
        'ToolSearch',
        'Skill',
        'NotebookEdit',
        'mcp__nanoclaw__*',
      ],
      env: sdkEnv,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      mcpServers: {
        nanoclaw: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            NANOCLAW_CHAT_JID: containerInput.chatJid,
            NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
            NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
          },
        },
      },
      hooks: {
        PreCompact: [
          { hooks: [createPreCompactHook(containerInput.assistantName)] },
        ],
        PreToolUse: [
          {
            // No matcher → runs on every tool use. The guard decides what to
            // allow/deny based on tool name and main-thread vs subagent.
            hooks: [
              createDelegationGuardHook(
                deriveOfficeFromGroupFolder(containerInput.groupFolder),
              ),
            ],
          },
          {
            // Pipeline tracker still records spawn-tool invocations as stages.
            matcher: 'Task',
            hooks: [
              createPipelinePreTaskHook(
                deriveOfficeFromGroupFolder(containerInput.groupFolder),
                containerInput.chatJid,
              ),
            ],
          },
          {
            matcher: 'Agent',
            hooks: [
              createPipelinePreTaskHook(
                deriveOfficeFromGroupFolder(containerInput.groupFolder),
                containerInput.chatJid,
              ),
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              createPipelineStopHook(
                deriveOfficeFromGroupFolder(containerInput.groupFolder),
                containerInput.chatJid,
              ),
            ],
          },
        ],
      },
    },
  })) {
    messageCount++;
    const msgType =
      message.type === 'system'
        ? `system/${(message as { subtype?: string }).subtype}`
        : message.type;
    log(`[msg #${messageCount}] type=${msgType}`);

    if (message.type === 'assistant' && 'uuid' in message) {
      lastAssistantUuid = (message as { uuid: string }).uuid;
    }

    if (message.type === 'system' && message.subtype === 'init') {
      newSessionId = message.session_id;
      log(`Session initialized: ${newSessionId}`);
    }

    if (
      message.type === 'system' &&
      (message as { subtype?: string }).subtype === 'task_notification'
    ) {
      const tn = message as {
        task_id: string;
        status: string;
        summary: string;
      };
      log(
        `Task notification: task=${tn.task_id} status=${tn.status} summary=${tn.summary}`,
      );
    }

    if (message.type === 'result') {
      resultCount++;
      const textResult =
        'result' in message ? (message as { result?: string }).result : null;
      log(
        `Result #${resultCount}: subtype=${message.subtype}${textResult ? ` text=${textResult.slice(0, 200)}` : ''}`,
      );

      // Automatic cost accounting — the SDK provides per-model usage data
      // (tokens + costUSD) on every result message. Write one cost record per
      // model used in the query so the host orchestrator can persist it. This
      // replaces relying on the LLM to voluntarily call report_token_usage,
      // which only the innovation office's orchestrator was actually doing.
      const resultMsg = message as {
        modelUsage?: Record<
          string,
          {
            inputTokens?: number;
            outputTokens?: number;
            cacheReadInputTokens?: number;
            cacheCreationInputTokens?: number;
            costUSD?: number;
          }
        >;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
        total_cost_usd?: number;
      };

      const office = deriveOfficeFromGroupFolder(containerInput.groupFolder);
      const containerName = containerInput.assistantName || office;

      if (resultMsg.modelUsage && Object.keys(resultMsg.modelUsage).length > 0) {
        for (const [modelId, mu] of Object.entries(resultMsg.modelUsage)) {
          writeCostRecord({
            agent_name: `${office} orchestrator`,
            model: modelId,
            tokens_in: mu.inputTokens ?? 0,
            tokens_out: mu.outputTokens ?? 0,
            tokens_cache_read: mu.cacheReadInputTokens ?? 0,
            tokens_cache_write: mu.cacheCreationInputTokens ?? 0,
            container_name: containerName,
            cost_usd: mu.costUSD,
          });
        }
        log(
          `Result #${resultCount}: recorded cost for ${Object.keys(resultMsg.modelUsage).length} model(s)`,
        );
      } else if (resultMsg.usage) {
        // Fallback when modelUsage is missing — use the consolidated usage
        // block. Model is unknown so the host's pricing table will assume
        // sonnet (its documented default).
        writeCostRecord({
          agent_name: `${office} orchestrator`,
          model: 'unknown',
          tokens_in: resultMsg.usage.input_tokens ?? 0,
          tokens_out: resultMsg.usage.output_tokens ?? 0,
          tokens_cache_read: resultMsg.usage.cache_read_input_tokens ?? 0,
          tokens_cache_write: resultMsg.usage.cache_creation_input_tokens ?? 0,
          container_name: containerName,
          cost_usd: resultMsg.total_cost_usd,
        });
        log(`Result #${resultCount}: recorded fallback cost from usage block`);
      } else {
        log(
          `Result #${resultCount}: no usage data on message — cost not recorded`,
        );
      }

      writeOutput({
        status: 'success',
        result: textResult || null,
        newSessionId,
      });
    }
  }

  ipcPolling = false;
  log(
    `Query done. Messages: ${messageCount}, results: ${resultCount}, lastAssistantUuid: ${lastAssistantUuid || 'none'}, closedDuringQuery: ${closedDuringQuery}`,
  );
  return { newSessionId, lastAssistantUuid, closedDuringQuery };
}

interface ScriptResult {
  wakeAgent: boolean;
  data?: unknown;
}

const SCRIPT_TIMEOUT_MS = 30_000;

async function runScript(script: string): Promise<ScriptResult | null> {
  const scriptPath = '/tmp/task-script.sh';
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  return new Promise((resolve) => {
    execFile(
      'bash',
      [scriptPath],
      {
        timeout: SCRIPT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: process.env,
      },
      (error, stdout, stderr) => {
        if (stderr) {
          log(`Script stderr: ${stderr.slice(0, 500)}`);
        }

        if (error) {
          log(`Script error: ${error.message}`);
          return resolve(null);
        }

        // Parse last non-empty line of stdout as JSON
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        if (!lastLine) {
          log('Script produced no output');
          return resolve(null);
        }

        try {
          const result = JSON.parse(lastLine);
          if (typeof result.wakeAgent !== 'boolean') {
            log(
              `Script output missing wakeAgent boolean: ${lastLine.slice(0, 200)}`,
            );
            return resolve(null);
          }
          resolve(result as ScriptResult);
        } catch {
          log(`Script output is not valid JSON: ${lastLine.slice(0, 200)}`);
          resolve(null);
        }
      },
    );
  });
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    try {
      fs.unlinkSync('/tmp/input.json');
    } catch {
      /* may not exist */
    }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  // Credentials are injected by the host's credential proxy via ANTHROPIC_BASE_URL.
  // No real secrets exist in the container environment.
  const sdkEnv: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '165000',
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  let sessionId = containerInput.sessionId;
  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Clean up stale _close sentinel from previous container runs
  try {
    fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
  } catch {
    /* ignore */
  }

  // Build initial prompt (drain any pending IPC messages too)
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  // Script phase: run script before waking agent
  if (containerInput.script && containerInput.isScheduledTask) {
    log('Running task script...');
    const scriptResult = await runScript(containerInput.script);

    if (!scriptResult || !scriptResult.wakeAgent) {
      const reason = scriptResult
        ? 'wakeAgent=false'
        : 'script error/no output';
      log(`Script decided not to wake agent: ${reason}`);
      writeOutput({
        status: 'success',
        result: null,
      });
      return;
    }

    // Script says wake agent — enrich prompt with script data
    log(`Script wakeAgent=true, enriching prompt with data`);
    prompt = `[SCHEDULED TASK]\n\nScript output:\n${JSON.stringify(scriptResult.data, null, 2)}\n\nInstructions:\n${containerInput.prompt}`;
  }

  // Query loop: run query → wait for IPC message → run new query → repeat
  let resumeAt: string | undefined;
  try {
    while (true) {
      log(
        `Starting query (session: ${sessionId || 'new'}, resumeAt: ${resumeAt || 'latest'})...`,
      );

      const queryResult = await runQuery(
        prompt,
        sessionId,
        mcpServerPath,
        containerInput,
        sdkEnv,
        resumeAt,
      );
      if (queryResult.newSessionId) {
        sessionId = queryResult.newSessionId;
      }
      if (queryResult.lastAssistantUuid) {
        resumeAt = queryResult.lastAssistantUuid;
      }

      // If _close was consumed during the query, exit immediately.
      // Don't emit a session-update marker (it would reset the host's
      // idle timer and cause a 30-min delay before the next _close).
      if (queryResult.closedDuringQuery) {
        log('Close sentinel consumed during query, exiting');
        break;
      }

      // Emit session update so host can track it
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log('Query ended, waiting for next IPC message...');

      // Wait for the next message or _close sentinel
      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new query`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage,
    });
    process.exit(1);
  }
}

main();
