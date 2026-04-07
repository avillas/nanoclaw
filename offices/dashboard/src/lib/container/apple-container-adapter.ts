// ============================================================================
// Apple Container Runtime Adapter — uses `container` CLI (macOS 26+)
// ============================================================================
//
// Apple's container CLI mirrors Docker CLI semantics:
//   container list --format json
//   container inspect <id>
//   container stats --no-stream --format json <id>
//   container start/stop/logs/exec
//
// Each container runs inside its own lightweight VM via Virtualization.framework.
// Networking: full container-to-container support on macOS 26.
// ============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ContainerInfo, ContainerStats } from '@/types';
import type { ContainerAdapter } from './types';
import { NANOCLAW_FILTER } from './types';

const execFileAsync = promisify(execFile);

const CLI = process.env.APPLE_CONTAINER_CLI || 'container';
const EXEC_TIMEOUT = 15_000;

/** Execute an Apple Container CLI command and return parsed JSON or raw stdout */
async function runCli(
  args: string[],
  parseJson = true
): Promise<any> {
  try {
    const { stdout } = await execFileAsync(CLI, args, {
      timeout: EXEC_TIMEOUT,
      env: { ...process.env },
    });
    if (parseJson && stdout.trim()) {
      return JSON.parse(stdout.trim());
    }
    return stdout.trim();
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error('Apple Container CLI not found');
    }
    throw err;
  }
}

function mapState(state: string): 'running' | 'paused' | 'stopped' | 'not_found' {
  switch (state.toLowerCase()) {
    case 'running':
      return 'running';
    case 'paused':
      return 'paused';
    case 'exited':
    case 'stopped':
    case 'dead':
      return 'stopped';
    case 'created':
      return 'stopped';
    default:
      return 'not_found';
  }
}

export class AppleContainerAdapter implements ContainerAdapter {
  readonly runtime = 'apple-container' as const;

  async isAvailable(): Promise<boolean> {
    try {
      await runCli(['--version'], false);
      return true;
    } catch {
      return false;
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    try {
      const raw = await runCli(['list', '--all', '--format', 'json']);
      const containers: any[] = Array.isArray(raw) ? raw : [raw];

      return containers
        .filter(
          (c) =>
            (c.Names || c.name || '').includes(NANOCLAW_FILTER.namePattern) ||
            (c.Labels || c.labels || {})[NANOCLAW_FILTER.label] !== undefined
        )
        .map((c) => {
          const id = (c.Id || c.id || '').substring(0, 12);
          const name = (c.Names?.[0] || c.name || 'unknown').replace(/^\//, '');
          const labels = c.Labels || c.labels || {};
          const ports = (c.Ports || c.ports || []).map((p: any) =>
            typeof p === 'string' ? p : `${p.PublicPort || ''}:${p.PrivatePort}/${p.Type}`
          );

          return {
            id,
            name,
            image: c.Image || c.image || '',
            status: c.Status || c.status || '',
            state: mapState(c.State || c.state || ''),
            created: c.Created || c.created
              ? typeof c.Created === 'number'
                ? new Date(c.Created * 1000).toISOString()
                : String(c.Created || c.created)
              : new Date().toISOString(),
            ports,
            labels,
            runtime: 'apple-container' as const,
          };
        });
    } catch {
      return [];
    }
  }

  async getStats(containerId: string): Promise<ContainerStats | null> {
    try {
      const raw = await runCli([
        'stats',
        '--no-stream',
        '--format',
        'json',
        containerId,
      ]);

      // Apple Container stats JSON structure may differ from Docker
      // We normalize to the same ContainerStats shape
      const stats = Array.isArray(raw) ? raw[0] : raw;
      if (!stats) return null;

      // The CLI outputs similar fields to Docker stats
      const cpuPercent = parseFloat(stats.CPUPerc || stats.cpu_percent || '0');
      const memUsage = parseMemory(stats.MemUsage || stats.memory_usage || '0');
      const memLimit = parseMemory(stats.MemLimit || stats.memory_limit || '0');
      const netRx = parseBytes(stats.NetIO?.split('/')[0] || '0');
      const netTx = parseBytes(stats.NetIO?.split('/')[1] || '0');

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsage: memUsage,
        memoryLimit: memLimit,
        memoryPercent:
          memLimit > 0 ? Math.round((memUsage / memLimit) * 10000) / 100 : 0,
        networkRx: netRx,
        networkTx: netTx,
      };
    } catch {
      return null;
    }
  }

  async startContainer(containerId: string): Promise<boolean> {
    try {
      await runCli(['start', containerId], false);
      return true;
    } catch {
      return false;
    }
  }

  async stopContainer(containerId: string): Promise<boolean> {
    try {
      await runCli(['stop', containerId], false);
      return true;
    } catch {
      return false;
    }
  }

  async getLogs(containerId: string, lines = 100): Promise<string> {
    try {
      return await runCli(['logs', '-n', String(lines), containerId], false);
    } catch {
      return '';
    }
  }

  async exec(containerId: string, command: string[]): Promise<string> {
    try {
      return await runCli(['exec', containerId, ...command], false);
    } catch {
      return '';
    }
  }
}

// --- Helpers for parsing human-readable stats output ---

function parseMemory(value: string): number {
  if (typeof value === 'number') return value;
  const str = String(value).trim();
  const match = str.match(/^([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB|TB)?$/i);
  if (!match) return parseInt(str, 10) || 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1_000_000,
    MIB: 1_048_576,
    GB: 1_000_000_000,
    GIB: 1_073_741_824,
    TB: 1_000_000_000_000,
  };
  return Math.round(num * (multipliers[unit] || 1));
}

function parseBytes(value: string): number {
  return parseMemory(value);
}
