// ============================================================================
// NanoClaw Mission Control — Offices Writer
// Creates new agents and offices by generating .md files from templates
// ============================================================================
import fs from 'fs';
import path from 'path';
import { invalidateCache } from './offices-reader';
import type { OfficeName, ModelTier } from '@/types';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------
// Dashboard runs from offices/dashboard/, so cwd/.. = offices root by default.
// NANOCLAW_OFFICES_ROOT overrides directly. NANOCLAW_ROOT (legacy) historically
// points at the offices directory itself (despite the name) — keep that
// convention for backward-compat with existing .env files.
function getOfficesRoot(): string {
  if (process.env.NANOCLAW_OFFICES_ROOT) {
    return path.resolve(process.env.NANOCLAW_OFFICES_ROOT);
  }
  if (process.env.NANOCLAW_ROOT) {
    return path.resolve(process.env.NANOCLAW_ROOT);
  }
  return path.resolve(process.cwd(), '..');
}

function getProjectRoot(): string {
  return path.resolve(getOfficesRoot(), '..');
}

function getGroupsDir(): string {
  return path.join(getProjectRoot(), 'groups');
}

function getTemplatesDir(): string {
  return path.join(getOfficesRoot(), '_template');
}

// ---------------------------------------------------------------------------
// Template loader with {{VAR}} substitution
// ---------------------------------------------------------------------------
function renderTemplate(file: string, vars: Record<string, string>): string {
  const tplPath = path.join(getTemplatesDir(), file);
  if (!fs.existsSync(tplPath)) {
    throw new Error(`Template not found: ${tplPath}`);
  }
  let content = fs.readFileSync(tplPath, 'utf-8');
  for (const [key, val] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, val);
  }
  return content;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (local — avoids importing reader internals)
// ---------------------------------------------------------------------------
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return result;
}

function extractH1(content: string, fallback: string): string {
  const m = content.replace(/^---\n[\s\S]*?\n---\n?/, '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function extractMissionFirstSentence(content: string, fallback: string): string {
  const m = content.match(/##\s+Mission\s*\n+([^\n]+)/i);
  if (!m) return fallback;
  const first = m[1].trim().split(/(?<=[.!?])\s/)[0];
  return first || fallback;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Team / Pipeline regeneration
// ---------------------------------------------------------------------------
interface AgentSummary {
  slug: string;
  displayName: string;
  role: string;
  model: string;
  pipelinePosition: number;
}

function readOfficeAgents(officeDir: string): AgentSummary[] {
  const agentsDir = path.join(officeDir, 'agents');
  if (!fs.existsSync(agentsDir)) return [];
  const out: AgentSummary[] = [];
  for (const file of fs.readdirSync(agentsDir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
    const fm = parseFrontmatter(content);
    out.push({
      slug,
      displayName: extractH1(content, slug),
      role: extractMissionFirstSentence(content, '—'),
      model: capitalize(fm.model || 'sonnet'),
      pipelinePosition: parseInt(fm.pipeline_position || '999', 10),
    });
  }
  return out.sort((a, b) => a.pipelinePosition - b.pipelinePosition);
}

function buildAgentsBlock(agents: AgentSummary[]): string {
  let table = '## Team\n\n| Agent | Role | Model |\n|-------|------|-------|\n';
  if (agents.length === 0) {
    table += '| _no agents yet_ | | |\n';
  } else {
    for (const a of agents) {
      table += `| ${a.displayName} | ${a.role} | ${a.model} |\n`;
    }
  }
  const pipelineBody =
    agents.length === 0
      ? '(No pipeline defined yet — add agents first)'
      : agents.map((a) => a.displayName).join(' → ');
  const pipeline = `\n## Pipeline\n\n\`\`\`\n${pipelineBody}\n\`\`\`\n`;
  return `<!-- AGENTS:START -->\n${table}${pipeline}<!-- AGENTS:END -->`;
}

/**
 * Regenerate the ## Team and ## Pipeline sections of an office's CLAUDE.md.
 * Uses <!-- AGENTS:START --> / <!-- AGENTS:END --> markers. If markers don't
 * exist (legacy file), replaces from `## Team` through the first `## Pipeline`
 * code block, then injects markers so future regens are surgical.
 */
export function regenerateOfficeClaudeMd(office: string): {
  success: boolean;
  error?: string;
} {
  const officeDir = path.join(getOfficesRoot(), office);
  const claudePath = path.join(officeDir, 'CLAUDE.md');
  if (!fs.existsSync(claudePath)) {
    return { success: false, error: `CLAUDE.md not found for office "${office}"` };
  }
  const agents = readOfficeAgents(officeDir);
  const block = buildAgentsBlock(agents);
  let content = fs.readFileSync(claudePath, 'utf-8');

  const markerRegex = /<!-- AGENTS:START -->[\s\S]*?<!-- AGENTS:END -->/;
  if (markerRegex.test(content)) {
    content = content.replace(markerRegex, block);
  } else {
    // Legacy file: replace ## Team .. through first ## Pipeline code block.
    const legacyRegex = /## Team\n[\s\S]*?## Pipeline\s*\n+```[\s\S]*?```\n?/;
    if (legacyRegex.test(content)) {
      content = content.replace(legacyRegex, block + '\n');
    } else {
      // No Team section at all — append the block before the first `##` after H1.
      content = content.replace(/(^#\s.+\n+(?:[^\n].*\n)*)/, `$1\n${block}\n\n`);
    }
  }

  fs.writeFileSync(claudePath, content, 'utf-8');

  // If a corresponding group exists, recompile it too.
  recompileGroupIfExists(office);

  invalidateCache();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Group compilation (office → groups/telegram_<slug>/CLAUDE.md)
// ---------------------------------------------------------------------------
function buildGroupClaudeMd(office: string): string {
  const officeDir = path.join(getOfficesRoot(), office);
  const claudeMd = fs.readFileSync(path.join(officeDir, 'CLAUDE.md'), 'utf-8');
  const soulPath = path.join(officeDir, 'SOUL.md');
  const soulMd = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf-8') : '';

  const officeFilesSection = `
## Office files (read-only mount)

The full office directory is mounted read-only inside this container at:

\`\`\`
/workspace/offices/${office}/
├── CLAUDE.md           # office instructions (already loaded above)
├── SOUL.md             # office personality (already loaded above)
├── agents/<slug>.md    # IDENTITY file for each sub-agent
├── skills/             # office-specific skills
└── workflows/          # office workflows
\`\`\`

Shared resources are available at \`/workspace/offices/shared/\`.

When you assume the role of a specific agent from the team table, you MUST first
\`Read\` its identity file at \`/workspace/offices/${office}/agents/<slug>.md\` (where
\`<slug>\` is the kebab-case agent name).
`;

  return `${claudeMd}\n${soulMd}\n${officeFilesSection}`;
}

function recompileGroupIfExists(office: string): void {
  const groupFolder = `telegram_${office}`;
  const groupDir = path.join(getGroupsDir(), groupFolder);
  if (!fs.existsSync(groupDir)) return;
  fs.writeFileSync(
    path.join(groupDir, 'CLAUDE.md'),
    buildGroupClaudeMd(office),
    'utf-8',
  );
}

export function compileGroupForOffice(office: string, groupFolder: string): void {
  const groupDir = path.join(getGroupsDir(), groupFolder);
  fs.mkdirSync(groupDir, { recursive: true });
  fs.writeFileSync(
    path.join(groupDir, 'CLAUDE.md'),
    buildGroupClaudeMd(office),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Agent creation
// ---------------------------------------------------------------------------
export interface CreateAgentInput {
  /** Slug name, e.g. "content-writer" */
  name: string;
  /** Office this agent belongs to */
  office: OfficeName | string;
  /** Display name, e.g. "Content Writer" */
  displayName: string;
  /** Primary skill reference */
  skill: string;
  /** Model tier */
  model: ModelTier;
  /** Position in the pipeline */
  pipelinePosition: number;
  /** Who sends input to this agent */
  receivesFrom: string;
  /** Who this agent delivers to */
  deliversTo: string;
  /** Agent identity description */
  identity: string;
  /** Agent mission */
  mission: string;
  /** Operating rules (one per line) */
  operatingRules: string;
  /** Expected deliverables */
  deliverables: string;
  /** Completion criteria */
  completionCriteria: string;
  /** Model escalation rules */
  modelEscalation: string;
}

export function createAgent(input: CreateAgentInput): {
  success: boolean;
  path: string;
  error?: string;
} {
  const root = getOfficesRoot();
  const officeDir = path.join(root, input.office);

  if (!fs.existsSync(officeDir)) {
    return { success: false, path: '', error: `Office "${input.office}" does not exist` };
  }

  const agentsDir = path.join(officeDir, 'agents');
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const filePath = path.join(agentsDir, `${input.name}.md`);
  if (fs.existsSync(filePath)) {
    return {
      success: false,
      path: filePath,
      error: `Agent "${input.name}" already exists in ${input.office}`,
    };
  }

  const content = `---
name: ${input.name}
office: ${input.office}
skill: ${input.skill}
model: ${input.model}
pipeline_position: ${input.pipelinePosition}
receives_from: ${input.receivesFrom}
delivers_to: ${input.deliversTo}
---

# ${input.displayName}

## Identity

${input.identity}

## Mission

${input.mission}

## Operating rules

${input.operatingRules}

## Deliverables

${input.deliverables}

## Completion criteria

${input.completionCriteria}

## Model escalation

${input.modelEscalation}
`;

  fs.writeFileSync(filePath, content, 'utf-8');

  // Keep the office CLAUDE.md (and any compiled group) in sync.
  regenerateOfficeClaudeMd(input.office);

  invalidateCache();
  return { success: true, path: filePath };
}

// ---------------------------------------------------------------------------
// Agent read (raw file content)
// ---------------------------------------------------------------------------

/**
 * Returns the raw markdown content of an agent file plus parsed frontmatter
 * and an extracted display name (from the H1 heading). Used by the edit modal
 * to populate both its structured form and its raw markdown editor.
 */
export function getAgentRawContent(
  office: string,
  name: string,
): {
  success: boolean;
  rawContent?: string;
  frontmatter?: Record<string, string>;
  displayName?: string;
  error?: string;
} {
  const root = getOfficesRoot();
  const filePath = path.join(root, office, 'agents', `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `Agent "${name}" not found in office "${office}"` };
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = parseFrontmatter(rawContent);
  const displayName = extractH1(rawContent, name);

  return { success: true, rawContent, frontmatter, displayName };
}

// ---------------------------------------------------------------------------
// Agent update
// ---------------------------------------------------------------------------

/**
 * Update only the YAML frontmatter of an agent file. Preserves key order,
 * preserves unknown keys, and only modifies fields explicitly passed in
 * `updates`. Returns the new full file content.
 */
function applyFrontmatterUpdates(
  content: string,
  updates: Record<string, string>,
): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    // No frontmatter — synthesize one at the top.
    const fm = Object.entries(updates)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    return `---\n${fm}\n---\n${content}`;
  }

  const fmBlock = match[1];
  const lines = fmBlock.split('\n');
  const seen = new Set<string>();
  const newLines = lines.map((line) => {
    const idx = line.indexOf(':');
    if (idx <= 0) return line;
    const key = line.slice(0, idx).trim();
    if (key in updates) {
      seen.add(key);
      return `${key}: ${updates[key]}`;
    }
    return line;
  });
  // Append any new keys not previously present.
  for (const [key, val] of Object.entries(updates)) {
    if (!seen.has(key)) {
      newLines.push(`${key}: ${val}`);
    }
  }
  const newFmBlock = newLines.join('\n');
  return content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFmBlock}\n---`);
}

/**
 * Replace the first H1 in the body with `newDisplayName`. If no H1 exists,
 * inject one immediately after the closing frontmatter fence (or at the top
 * of the file if there is no frontmatter).
 */
function applyDisplayNameUpdate(content: string, newDisplayName: string): string {
  // Split off the frontmatter (if any) and operate on the body alone — that
  // way the H1 regex can't accidentally match against `---` fences or the
  // raw key/value lines inside the frontmatter block.
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---\n?)/);
  const fm = fmMatch ? fmMatch[1] : '';
  const body = content.slice(fm.length);

  if (/^#\s+.+/m.test(body)) {
    const newBody = body.replace(/^#\s+.+/m, `# ${newDisplayName}`);
    return fm + newBody;
  }
  return `${fm}# ${newDisplayName}\n\n${body}`;
}

export interface UpdateAgentAttributes {
  displayName?: string;
  skill?: string;
  model?: string;
  pipelinePosition?: number;
  receivesFrom?: string;
  deliversTo?: string;
}

export type UpdateAgentInput =
  | { mode: 'attributes'; attributes: UpdateAgentAttributes }
  | { mode: 'markdown'; rawMarkdown: string };

export function updateAgent(
  office: string,
  name: string,
  input: UpdateAgentInput,
): { success: boolean; error?: string } {
  const root = getOfficesRoot();
  const filePath = path.join(root, office, 'agents', `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `Agent "${name}" not found in office "${office}"` };
  }

  let newContent: string;

  if (input.mode === 'markdown') {
    if (typeof input.rawMarkdown !== 'string' || input.rawMarkdown.trim().length === 0) {
      return { success: false, error: 'rawMarkdown must be a non-empty string' };
    }
    newContent = input.rawMarkdown;
  } else {
    const current = fs.readFileSync(filePath, 'utf-8');
    const updates: Record<string, string> = {};
    const a = input.attributes || {};
    if (a.skill !== undefined) updates.skill = a.skill;
    if (a.model !== undefined) updates.model = a.model;
    if (a.pipelinePosition !== undefined) updates.pipeline_position = String(a.pipelinePosition);
    if (a.receivesFrom !== undefined) updates.receives_from = a.receivesFrom;
    if (a.deliversTo !== undefined) updates.delivers_to = a.deliversTo;

    let updated = Object.keys(updates).length > 0
      ? applyFrontmatterUpdates(current, updates)
      : current;

    if (a.displayName !== undefined && a.displayName.trim().length > 0) {
      updated = applyDisplayNameUpdate(updated, a.displayName.trim());
    }
    newContent = updated;
  }

  fs.writeFileSync(filePath, newContent, 'utf-8');

  // Keep CLAUDE.md (and any compiled group) in sync — model/position/display
  // name may all affect the rendered Team table.
  regenerateOfficeClaudeMd(office);

  invalidateCache();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Agent deletion
// ---------------------------------------------------------------------------
export function deleteAgent(
  office: string,
  name: string,
): { success: boolean; error?: string } {
  const root = getOfficesRoot();
  const filePath = path.join(root, office, 'agents', `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `Agent "${name}" not found in office "${office}"` };
  }

  fs.unlinkSync(filePath);

  // Also remove the skill directory if it exists
  const skillDir = path.join(root, office, 'skills', name);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  // Keep the office CLAUDE.md (and any compiled group) in sync.
  regenerateOfficeClaudeMd(office);

  invalidateCache();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Office creation
// ---------------------------------------------------------------------------
export interface CreateOfficeInput {
  /** Slug name, e.g. "sales" */
  name: string;
  /** Display name, e.g. "Sales Office" */
  displayName: string;
  /** Office description/mission */
  mission: string;
  /** Default model for agents */
  defaultModel: ModelTier;
  /** Daily budget in BRL */
  dailyBudget: number;
  /** Monthly budget in BRL */
  monthlyBudget: number;
  /** SOUL.md sections */
  soul: {
    quemSomos: string;
    comoPensamos: string;
    comoNosComunicamos: string;
    nossosValores: string;
    comoRaciocinamos: string;
    oQueNaoToleramos: string;
    relacaoComOutrosEscritorios: string;
    estiloDeEntrega: string;
  };
  /**
   * If true (default), also creates a corresponding NanoClaw group at
   * groups/telegram_<name>/ with the compiled CLAUDE.md so the orchestrator
   * can route messages to this office. The channel itself still needs to be
   * registered via /setup.
   */
  registerAsGroup?: boolean;
  /** Override the group folder name. Default: `telegram_<name>` */
  groupFolder?: string;
}

export function createOffice(input: CreateOfficeInput): {
  success: boolean;
  path: string;
  error?: string;
} {
  const root = getOfficesRoot();
  const officeDir = path.join(root, input.name);

  if (fs.existsSync(officeDir)) {
    return { success: false, path: officeDir, error: `Office "${input.name}" already exists` };
  }

  // Create directory structure
  fs.mkdirSync(path.join(officeDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(officeDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(officeDir, 'workflows'), { recursive: true });

  // Render CLAUDE.md from _template/CLAUDE.md.template
  const claudeMd = renderTemplate('CLAUDE.md.template', {
    OFFICE_DISPLAY_NAME: input.displayName,
    OFFICE_NAME: input.displayName,
    OFFICE_SLUG: input.name,
    OFFICE_MISSION: input.mission,
    DEFAULT_MODEL: capitalize(input.defaultModel),
    DAILY_BUDGET: input.dailyBudget.toFixed(2),
    MONTHLY_BUDGET: input.monthlyBudget.toFixed(2),
    AGENT_COUNT: '0',
    PIPELINE: '(No pipeline defined yet — add agents first)',
  });
  fs.writeFileSync(path.join(officeDir, 'CLAUDE.md'), claudeMd, 'utf-8');

  // Render SOUL.md — template has placeholders, but we have real content,
  // so we write the populated SOUL directly (template is fallback for manual flows).
  const soulMd = `# Soul — ${input.displayName}

## Quem somos

${input.soul.quemSomos}

## Como pensamos

${input.soul.comoPensamos}

## Como nos comunicamos

${input.soul.comoNosComunicamos}

## Nossos valores

${input.soul.nossosValores}

## Como raciocinamos

${input.soul.comoRaciocinamos}

## O que nao toleramos

${input.soul.oQueNaoToleramos}

## Relacao com outros escritorios

${input.soul.relacaoComOutrosEscritorios}

## Estilo de entrega

${input.soul.estiloDeEntrega}
`;
  fs.writeFileSync(path.join(officeDir, 'SOUL.md'), soulMd, 'utf-8');

  // Auto-register as a NanoClaw group so the orchestrator can route to it.
  if (input.registerAsGroup !== false) {
    const groupFolder = input.groupFolder || `telegram_${input.name}`;
    compileGroupForOffice(input.name, groupFolder);
  }

  invalidateCache();
  return { success: true, path: officeDir };
}

// ---------------------------------------------------------------------------
// Office read (raw file content for edit modal)
// ---------------------------------------------------------------------------

export function getOfficeRawContent(
  office: string,
): {
  success: boolean;
  claudeMd?: string;
  soulMd?: string;
  metadata?: {
    displayName: string;
    mission: string;
    dailyBudget: string;
    monthlyBudget: string;
  };
  error?: string;
} {
  const officeDir = path.join(getOfficesRoot(), office);
  const claudePath = path.join(officeDir, 'CLAUDE.md');

  if (!fs.existsSync(claudePath)) {
    return { success: false, error: `Office "${office}" not found` };
  }

  const claudeMd = fs.readFileSync(claudePath, 'utf-8');
  const soulPath = path.join(officeDir, 'SOUL.md');
  const soulMd = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf-8') : '';

  // Extract metadata from CLAUDE.md
  const h1Match = claudeMd.match(/^#\s+(.+)$/m);
  const displayName = h1Match ? h1Match[1].trim() : office;

  const missionMatch = claudeMd.match(/focused on (.+?)[\.\n]/i)
    || claudeMd.match(/responsible for (.+?)[\.\n]/i);
  const mission = missionMatch ? missionMatch[1].trim() : '';

  const dailyBudgetMatch = claudeMd.match(/Daily budget[:\s]*R?\$?\s*([\d,.]+)/i);
  const monthlyBudgetMatch = claudeMd.match(/Monthly budget[:\s]*R?\$?\s*([\d,.]+)/i);
  const dailyBudget = dailyBudgetMatch ? dailyBudgetMatch[1] : '0';
  const monthlyBudget = monthlyBudgetMatch ? monthlyBudgetMatch[1] : '0';

  return {
    success: true,
    claudeMd,
    soulMd,
    metadata: { displayName, mission, dailyBudget, monthlyBudget },
  };
}

// ---------------------------------------------------------------------------
// Office update
// ---------------------------------------------------------------------------

export interface UpdateOfficeMetadata {
  displayName?: string;
  mission?: string;
  dailyBudget?: string;
  monthlyBudget?: string;
}

export type UpdateOfficeInput =
  | { mode: 'metadata'; metadata: UpdateOfficeMetadata }
  | { mode: 'claudemd'; rawMarkdown: string }
  | { mode: 'soul'; rawMarkdown: string };

export function updateOffice(
  office: string,
  input: UpdateOfficeInput,
): { success: boolean; error?: string } {
  const officeDir = path.join(getOfficesRoot(), office);
  const claudePath = path.join(officeDir, 'CLAUDE.md');

  if (!fs.existsSync(claudePath)) {
    return { success: false, error: `Office "${office}" not found` };
  }

  if (input.mode === 'soul') {
    if (typeof input.rawMarkdown !== 'string' || input.rawMarkdown.trim().length === 0) {
      return { success: false, error: 'SOUL.md content must be non-empty' };
    }
    const soulPath = path.join(officeDir, 'SOUL.md');
    fs.writeFileSync(soulPath, input.rawMarkdown, 'utf-8');
    recompileGroupIfExists(office);
    invalidateCache();
    return { success: true };
  }

  if (input.mode === 'claudemd') {
    if (typeof input.rawMarkdown !== 'string' || input.rawMarkdown.trim().length === 0) {
      return { success: false, error: 'CLAUDE.md content must be non-empty' };
    }
    fs.writeFileSync(claudePath, input.rawMarkdown, 'utf-8');
    // Regenerate Team/Pipeline markers in case user removed them
    regenerateOfficeClaudeMd(office);
    invalidateCache();
    return { success: true };
  }

  // mode === 'metadata'
  let content = fs.readFileSync(claudePath, 'utf-8');
  const m = input.metadata || {};

  if (m.displayName !== undefined && m.displayName.trim().length > 0) {
    const newName = m.displayName.trim();
    if (/^#\s+.+/m.test(content)) {
      content = content.replace(/^#\s+.+/m, `# ${newName}`);
    } else {
      content = `# ${newName}\n\n${content}`;
    }
    // Also update the first paragraph that says "You are the X —"
    content = content.replace(
      /You are the .+? —/,
      `You are the ${newName} —`,
    );
  }

  if (m.mission !== undefined && m.mission.trim().length > 0) {
    const newMission = m.mission.trim();
    // Replace "focused on ..." up to the period in the first paragraph
    content = content.replace(
      /focused on .+?\./i,
      `focused on ${newMission}.`,
    );
  }

  if (m.dailyBudget !== undefined) {
    content = content.replace(
      /Daily budget[:\s]*R?\$?\s*[\d,.]+/i,
      `Daily budget: R$ ${m.dailyBudget}`,
    );
  }

  if (m.monthlyBudget !== undefined) {
    content = content.replace(
      /Monthly budget[:\s]*R?\$?\s*[\d,.]+/i,
      `Monthly budget: R$ ${m.monthlyBudget}`,
    );
  }

  fs.writeFileSync(claudePath, content, 'utf-8');
  regenerateOfficeClaudeMd(office);
  invalidateCache();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** List existing offices (directory names that contain a CLAUDE.md) */
export function listOfficeNames(): string[] {
  const root = getOfficesRoot();
  try {
    return fs.readdirSync(root).filter((name) => {
      if (
        name.startsWith('_') ||
        name.startsWith('.') ||
        name === 'shared' ||
        name === 'dashboard' ||
        name === 'docs'
      )
        return false;
      return fs.existsSync(path.join(root, name, 'CLAUDE.md'));
    });
  } catch {
    return [];
  }
}

/** List skills available for an office (office-specific + shared) */
export function listAvailableSkills(office: string): string[] {
  const root = getOfficesRoot();
  const skills: string[] = [];

  // Office skills
  const officeSkillDir = path.join(root, office, 'skills');
  if (fs.existsSync(officeSkillDir)) {
    for (const dir of fs.readdirSync(officeSkillDir)) {
      if (fs.existsSync(path.join(officeSkillDir, dir, 'SKILL.md'))) {
        skills.push(dir);
      }
    }
  }

  // Shared skills
  const sharedSkillDir = path.join(root, 'shared', 'skills');
  if (fs.existsSync(sharedSkillDir)) {
    for (const dir of fs.readdirSync(sharedSkillDir)) {
      if (fs.existsSync(path.join(sharedSkillDir, dir, 'SKILL.md'))) {
        skills.push(dir);
      }
    }
  }

  return [...new Set(skills)].sort();
}
