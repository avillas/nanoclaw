// ============================================================================
// NanoClaw Mission Control — Offices Reader
// Reads real data from offices/ markdown files instead of mock data
// ============================================================================
import fs from 'fs';
import path from 'path';
import type {
  Office, Agent, Pipeline, PipelineStage, CostSummary, DashboardKPIs,
  OfficeName, ModelTier, OfficeStatus,
} from '@/types';
import { getDailyCostSummary, getMonthlyCostSummary, getAgentCostsToday } from '@/lib/db';

// ---------------------------------------------------------------------------
// Resolve offices root
// ---------------------------------------------------------------------------
function getOfficesRoot(): string {
  if (process.env.NANOCLAW_OFFICES_ROOT) {
    return path.resolve(process.env.NANOCLAW_OFFICES_ROOT);
  }
  if (process.env.NANOCLAW_ROOT) {
    return path.resolve(process.env.NANOCLAW_ROOT);
  }
  return path.resolve(process.cwd(), '..');
}

/** Dynamically discover offices by scanning the filesystem */
function discoverOfficeNames(): string[] {
  const root = getOfficesRoot();
  try {
    return fs.readdirSync(root).filter((name) => {
      if (name.startsWith('_') || name.startsWith('.') || name === 'shared' || name === 'dashboard' || name === 'docs' || name === 'store') return false;
      return fs.existsSync(path.join(root, name, 'CLAUDE.md'));
    });
  } catch {
    return ['marketing', 'development', 'innovation'];
  }
}

/** Extract display name from CLAUDE.md heading, e.g. "# Sales Office" */
function extractDisplayName(claudeMd: string, fallbackName: string): string {
  const match = claudeMd.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1) + ' Office';
}

/** Extract description from "focused on ..." or "responsible for ..." in first paragraph */
function extractDescription(claudeMd: string, fallbackName: string): string {
  const match = claudeMd.match(/focused on (.+?)[\.\n]/i) || claudeMd.match(/responsible for (.+?)[\.\n]/i);
  if (match) return match[1].trim();
  return `${fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1)} operations`;
}

// ---------------------------------------------------------------------------
// Markdown parsing helpers
// ---------------------------------------------------------------------------
function readFileOr(filepath: string, fallback = ''): string {
  try {
    return fs.readFileSync(filepath, 'utf-8');
  } catch {
    return fallback;
  }
}

/** Extract YAML frontmatter from a markdown file */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

/** Extract a markdown table as array of objects */
function parseMarkdownTable(content: string, headerMarker: string): Record<string, string>[] {
  const lines = content.split('\n');
  let headerIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(headerMarker) && lines[i].includes('|')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headerLine = lines[headerIdx];
  const headers = headerLine.split('|').map(h => h.trim()).filter(Boolean);

  // Skip separator line (|---|---|...)
  const dataStart = headerIdx + 2;
  const rows: Record<string, string>[] = [];

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !line.includes('|')) break;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length === 0 || cells[0].startsWith('---')) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

/** Extract a value after a pattern like "Daily budget: $15.00" or "Daily budget: R$ 15.00" */
function extractBudgetValue(content: string, pattern: string): number {
  const regex = new RegExp(`${pattern}[:\\s]*(?:US)?R?\\$?\\s*([\\d,.]+)`, 'i');
  const match = content.match(regex);
  if (!match) return 0;
  return parseFloat(match[1].replace(',', '.'));
}

// ---------------------------------------------------------------------------
// Pipeline parser — reads workflow .md files
// ---------------------------------------------------------------------------
function parsePipelineStages(officeName: OfficeName): PipelineStage[] {
  const root = getOfficesRoot();
  const workflowDir = path.join(root, officeName, 'workflows');

  if (!fs.existsSync(workflowDir)) return [];

  const files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return [];

  const content = readFileOr(path.join(workflowDir, files[0]));
  const rows = parseMarkdownTable(content, '#');

  return rows.map((row) => {
    const position = parseInt(row['#'] || '0', 10);
    return {
      position: isNaN(position) ? 0 : position,
      agentName: row['Agent'] || '',
      action: row['Action'] || '',
      gate: row['Gate'] && row['Gate'] !== '—' ? row['Gate'] : undefined,
      onFail: row['On fail'] && row['On fail'] !== '—' ? row['On fail'] : undefined,
    };
  }).filter(s => s.agentName);
}

// ---------------------------------------------------------------------------
// Agent reader — reads agents/*.md from each office
// ---------------------------------------------------------------------------
function readAgentsForOffice(officeName: OfficeName): Agent[] {
  const root = getOfficesRoot();
  const agentsDir = path.join(root, officeName, 'agents');

  if (!fs.existsSync(agentsDir)) return [];

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

  return files.map((file, idx) => {
    const content = readFileOr(path.join(agentsDir, file));
    const fm = parseFrontmatter(content);
    const agentSlug = path.basename(file, '.md');

    // Parse skills (comma-separated in frontmatter)
    const skillsRaw = fm.skill || fm.skills || '';
    const skills = skillsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Extract role from ## Identity or ## Mission section, or use first body line
    let role = '';
    const identityMatch = content.match(/##\s*(?:Identity|Mission)\s*\n+([\s\S]*?)(?:\n##|\n---|\n$)/);
    if (identityMatch) {
      const firstSentence = identityMatch[1].trim().split(/[.\n]/)[0];
      role = firstSentence.length > 80 ? firstSentence.slice(0, 77) + '...' : firstSentence;
    }

    // Extract display name from # heading or frontmatter
    let displayName = fm.name || agentSlug;
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      displayName = headingMatch[1].trim();
    }

    const pipelinePosition = parseInt(fm.pipeline_position || '0', 10);
    const model = (fm.model || 'sonnet') as ModelTier;

    // Office prefix for ID
    const prefix = officeName === 'marketing' ? 'mkt' : officeName === 'development' ? 'dev' : 'inn';

    return {
      id: `${prefix}-${String(idx + 1).padStart(2, '0')}`,
      slug: agentSlug,
      name: displayName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      office: officeName,
      role,
      model,
      status: 'idle' as const,
      pipelinePosition: isNaN(pipelinePosition) ? idx + 1 : pipelinePosition,
      skills,
      tasksCompleted: 0,
      tokensUsed: 0,
      costToday: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Office reader — reads CLAUDE.md for each office
// ---------------------------------------------------------------------------
function readOffice(officeName: string): Office {
  const root = getOfficesRoot();
  const claudeMd = readFileOr(path.join(root, officeName, 'CLAUDE.md'));
  const agents = readAgentsForOffice(officeName as any);
  const pipeline = parsePipelineStages(officeName as any);

  // Extract budgets from CLAUDE.md
  const dailyBudget = extractBudgetValue(claudeMd, 'Daily budget');
  const monthlyBudget = extractBudgetValue(claudeMd, 'Monthly budget');

  // Fetch real cost data from the database
  const today = new Date().toISOString().slice(0, 10);
  const yearMonth = today.slice(0, 7);
  const dailyCosts = getDailyCostSummary(today);
  const monthlyCosts = getMonthlyCostSummary(yearMonth);

  const officeDailyCost = dailyCosts.find(c => c.office === officeName);
  const officeMonthlyCost = monthlyCosts.find(c => c.office === officeName);

  const dailySpent = officeDailyCost?.total_cost_usd ?? 0;
  const monthlySpent = officeMonthlyCost?.total_cost_usd ?? 0;

  // Determine office status based on budget usage
  let status: OfficeStatus = 'operational';
  if (dailyBudget > 0 && dailySpent >= dailyBudget) {
    status = 'degraded';
  }

  return {
    name: officeName as OfficeName,
    displayName: extractDisplayName(claudeMd, officeName),
    description: extractDescription(claudeMd, officeName),
    agentCount: agents.length,
    activeAgents: 0, // Real value comes from container runtime
    pipeline: pipeline.length > 0 ? pipeline : extractPipelineFromClaudeMd(claudeMd),
    dailyBudget,
    monthlyBudget,
    dailySpent,
    monthlySpent,
    status,
  };
}

/** Fallback: extract pipeline from CLAUDE.md Team table if no workflow file */
function extractPipelineFromClaudeMd(content: string): PipelineStage[] {
  const rows = parseMarkdownTable(content, 'Agent');
  return rows.map((row, idx) => ({
    position: idx + 1,
    agentName: row['Agent'] || '',
    action: row['Role'] || '',
    gate: undefined,
    onFail: undefined,
  }));
}

// ---------------------------------------------------------------------------
// Public API — cached reads with TTL
// ---------------------------------------------------------------------------
interface Cache<T> {
  data: T | null;
  timestamp: number;
}

const CACHE_TTL = 30_000; // 30 seconds

const officesCache: Cache<Office[]> = { data: null, timestamp: 0 };
const agentsCache: Cache<Agent[]> = { data: null, timestamp: 0 };

function isFresh<T>(cache: Cache<T>): cache is Cache<T> & { data: T } {
  return cache.data !== null && Date.now() - cache.timestamp < CACHE_TTL;
}

export function getOffices(): Office[] {
  if (isFresh(officesCache)) return officesCache.data;

  const officeNames = discoverOfficeNames();
  const offices = officeNames.map(readOffice);
  officesCache.data = offices;
  officesCache.timestamp = Date.now();
  return offices;
}

export function getOfficeByName(name: string): Office | undefined {
  return getOffices().find(o => o.name === name);
}

export function getAllAgents(): Agent[] {
  if (isFresh(agentsCache)) return agentsCache.data;

  const officeNames = discoverOfficeNames();
  const agents = officeNames.flatMap((name) => readAgentsForOffice(name as OfficeName));
  agentsCache.data = agents;
  agentsCache.timestamp = Date.now();
  return agents;
}

export function getAgentsByOffice(office: OfficeName): Agent[] {
  return getAllAgents().filter(a => a.office === office);
}

export function getCostSummaries(): CostSummary[] {
  const offices = getOffices();
  return offices.map(o => ({
    office: o.name,
    dailyBudget: o.dailyBudget,
    monthlyBudget: o.monthlyBudget,
    dailySpent: o.dailySpent,
    monthlySpent: o.monthlySpent,
    dailyPercentage: o.dailyBudget > 0 ? (o.dailySpent / o.dailyBudget) * 100 : 0,
    monthlyPercentage: o.monthlyBudget > 0 ? (o.monthlySpent / o.monthlyBudget) * 100 : 0,
  }));
}

export function getDashboardKPIs(): DashboardKPIs {
  const offices = getOffices();
  const agents = getAllAgents();

  // Enrich agents with today's cost data
  const today = new Date().toISOString().slice(0, 10);
  const agentCosts = getAgentCostsToday(today);

  for (const agent of agents) {
    const costData = agentCosts.find(
      c => c.agent_name === agent.name && c.office === agent.office
    );
    if (costData) {
      agent.costToday = costData.total_cost;
      agent.tokensUsed = costData.total_tokens;
    }
  }

  return {
    totalAgents: agents.length,
    activeAgents: agents.filter(a => a.status === 'working').length,
    runningPipelines: 0,
    completedToday: 0,
    totalCostToday: offices.reduce((sum, o) => sum + o.dailySpent, 0),
    totalCostMonth: offices.reduce((sum, o) => sum + o.monthlySpent, 0),
    offices,
  };
}

/** Invalidate all caches — call when files may have changed */
export function invalidateCache(): void {
  officesCache.data = null;
  officesCache.timestamp = 0;
  agentsCache.data = null;
  agentsCache.timestamp = 0;
}
