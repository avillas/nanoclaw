#!/usr/bin/env node
/**
 * NanoClaw pipeline tracker hook.
 *
 * Runs inside the agent container via Claude Code hooks. Intercepts Task tool
 * invocations (sub-agent spawns) and session Stop events, writing pipeline
 * progress files to /workspace/ipc/pipelines/ where the host IPC watcher
 * picks them up and records them in pipeline_executions / pipeline_stages.
 *
 * Triggered by these hook events:
 *   - PreToolUse  (matcher: Task)  → stage started (position N)
 *   - Stop        (no matcher)     → whole pipeline completed
 *
 * The hook never fails the tool call: on any error it exits 0 quietly.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const IPC_DIR = '/workspace/ipc';
const PIPELINES_DIR = path.join(IPC_DIR, 'pipelines');
const STATE_DIR = path.join(IPC_DIR, 'pipelines-state');

async function readStdin() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function readState(sessionId) {
  const file = path.join(STATE_DIR, `${sessionId}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return { nextPosition: 1, totalStages: 0, lastPosition: 0 };
  }
}

function writeState(sessionId, state) {
  fs.writeFileSync(
    path.join(STATE_DIR, `${sessionId}.json`),
    JSON.stringify(state),
  );
}

function countOfficeAgents() {
  const office = process.env.NANOCLAW_OFFICE;
  if (!office) return 0;
  try {
    return fs
      .readdirSync(`/workspace/offices/${office}/agents`)
      .filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

function emit(record) {
  fs.mkdirSync(PIPELINES_DIR, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`;
  fs.writeFileSync(path.join(PIPELINES_DIR, name), JSON.stringify(record));
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const payload = await readStdin();
  const event = payload.hook_event_name;
  const sessionId = payload.session_id || 'unknown';
  const now = new Date().toISOString();

  // Some offices "become" an agent by Read-ing its identity file rather
  // than spawning a Task subagent. Capture that as an active-agent signal.
  if (event === 'PreToolUse' && payload.tool_name === 'Read') {
    const filePath = payload.tool_input?.file_path;
    const m = typeof filePath === 'string'
      ? filePath.match(/\/workspace\/offices\/[^/]+\/agents\/([^/]+)\.md$/)
      : null;
    if (m) {
      try {
        fs.writeFileSync(
          path.join(IPC_DIR, 'active-agent.json'),
          JSON.stringify({
            office: process.env.NANOCLAW_OFFICE || null,
            subagent: m[1],
            session_id: sessionId,
            started_at: now,
            source: 'role-read',
          }),
        );
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (
    event === 'PreToolUse' &&
    (payload.tool_name === 'Task' || payload.tool_name === 'Agent')
  ) {
    const subagent = (payload.tool_input?.subagent_type || '').trim();
    const office = process.env.NANOCLAW_OFFICE || null;

    // Delegation guard: reject calls that don't name a real office agent.
    if (office) {
      let validSlugs = [];
      try {
        validSlugs = fs
          .readdirSync(`/workspace/offices/${office}/agents`)
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.replace(/\.md$/, ''));
      } catch {
        /* no agents dir — let through */
      }
      if (validSlugs.length > 0 && !validSlugs.includes(subagent)) {
        const list = validSlugs.map((s) => `- ${s}`).join('\n');
        const reason =
          `Delegation rejected: subagent_type "${subagent || '(missing)'}" is not a valid agent of the ${office} office.\n\n` +
          `You MUST set subagent_type to one of:\n${list}\n\n` +
          `These are the kebab-case filenames in /workspace/offices/${office}/agents/. ` +
          `The "general-purpose" subagent is forbidden in this office. ` +
          `Before retrying, Read the identity file of the agent you are about to delegate to.`;
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: reason,
            },
          }),
        );
        return;
      }
    }
    const state = readState(sessionId);
    if (!state.totalStages) state.totalStages = countOfficeAgents();

    const position = state.nextPosition;
    state.nextPosition = position + 1;
    state.lastPosition = position;
    writeState(sessionId, state);

    emit({
      execution_id: `pipe-${sessionId}`,
      stage: position,
      total_stages: state.totalStages,
      status: position === 1 ? 'started' : 'running',
      agent_name: subagent,
      triggered_by: process.env.NANOCLAW_OFFICE || 'agent',
      started_at: now,
    });
    // NOTE: active-agent.json is owned by the in-process delegation guard
    // hook in agent-runner/src/index.ts. Don't write it from here — doing
    // so would race with the in-process hook and could record an invalid
    // subagent (the in-process guard rejects general-purpose, but the
    // shell hook would have already written the marker).
    return;
  }

  if (event === 'Stop') {
    const state = readState(sessionId);
    if (state.lastPosition > 0) {
      emit({
        execution_id: `pipe-${sessionId}`,
        stage: state.lastPosition,
        total_stages: state.totalStages,
        status: 'completed',
        agent_name: 'pipeline',
        completed_at: now,
      });
    }
    try {
      fs.rmSync(path.join(IPC_DIR, 'active-agent.json'), { force: true });
    } catch {
      /* ignore */
    }
    return;
  }
}

main().catch(() => process.exit(0));
