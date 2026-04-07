/**
 * Reads the per-group `active-agent.json` markers written by the container
 * pipeline-tracker hook and exposes which sub-agent is currently running in
 * each office.
 *
 * The container writes `data/ipc/<group-folder>/active-agent.json` whenever
 * the orchestrator either delegates via the `Agent`/`Task` tool or "becomes"
 * an agent by `Read`-ing its identity file. The host process leaves these
 * files in place; the dashboard polls them to highlight the active agent in
 * real time across the various views.
 */
import fs from 'fs';
import path from 'path';
import type { Agent } from '@/types';

interface ActiveAgentMarker {
  office: string;
  subagent: string;
  session_id?: string;
  started_at?: string;
  source?: string;
}

function getNanoClawRoot(): string {
  // In this dashboard, NANOCLAW_ROOT (or NANOCLAW_OFFICES_ROOT) points at
  // the *offices* directory, not the project root — match the convention in
  // offices-reader.ts / offices-writer.ts so we resolve `data/ipc/` against
  // the actual project root one level above the offices dir.
  const officesRoot = process.env.NANOCLAW_OFFICES_ROOT
    ? path.resolve(process.env.NANOCLAW_OFFICES_ROOT)
    : process.env.NANOCLAW_ROOT
      ? path.resolve(process.env.NANOCLAW_ROOT)
      : path.resolve(process.cwd(), '..');
  return path.resolve(officesRoot, '..');
}

/**
 * Returns a map of office slug → sub-agent slug for every group container that
 * currently has an active-agent marker on disk. Stale or malformed files are
 * silently ignored.
 */
export function readActiveSubagents(): Map<string, ActiveAgentMarker> {
  const map = new Map<string, ActiveAgentMarker>();
  const ipcRoot = path.join(getNanoClawRoot(), 'data', 'ipc');
  if (!fs.existsSync(ipcRoot)) return map;

  for (const groupFolder of fs.readdirSync(ipcRoot)) {
    const file = path.join(ipcRoot, groupFolder, 'active-agent.json');
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as ActiveAgentMarker;
      const office =
        data.office ||
        groupFolder.match(/^(?:telegram|whatsapp|slack|discord)_(.+)$/)?.[1] ||
        groupFolder;
      if (office && data.subagent) {
        map.set(office, { ...data, office });
      }
    } catch {
      /* ignore malformed file */
    }
  }
  return map;
}

/**
 * True when this agent record matches the active marker. Compares against
 * `slug` (canonical), `id` (legacy compat) and is case-insensitive.
 */
export function isAgentActive(
  agent: Pick<Agent, 'office' | 'slug' | 'id'>,
  active: Map<string, ActiveAgentMarker>,
): boolean {
  const marker = active.get(agent.office);
  if (!marker) return false;
  const s = marker.subagent;
  return (
    s === agent.slug ||
    s === agent.id ||
    s.toLowerCase() === agent.slug.toLowerCase()
  );
}

/**
 * Stamps every agent that matches an active marker as `working`. Returns a
 * fresh array; the input is not mutated.
 */
export function enrichAgentsWithActive<T extends Pick<Agent, 'office' | 'slug' | 'id' | 'status'>>(
  agents: T[],
  active: Map<string, ActiveAgentMarker> = readActiveSubagents(),
): T[] {
  return agents.map((agent) =>
    isAgentActive(agent, active)
      ? { ...agent, status: 'working' as const }
      : agent,
  );
}
