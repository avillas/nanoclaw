// ============================================================================
// Docker Runtime Adapter — uses dockerode (Docker Engine API via socket)
// ============================================================================

import type { ContainerInfo, ContainerStats } from '@/types';
import type { ContainerAdapter } from './types';
import { NANOCLAW_FILTER } from './types';

let dockerode: any = null;

function getClient(): any | null {
  if (dockerode) return dockerode;
  try {
    // Dynamic import to avoid build errors when dockerode is not available
    const Dockerode = require('dockerode');
    const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    dockerode = new Dockerode({ socketPath });
    return dockerode;
  } catch {
    return null;
  }
}

function mapState(state: string): 'running' | 'paused' | 'stopped' | 'not_found' {
  switch (state.toLowerCase()) {
    case 'running':
      return 'running';
    case 'paused':
      return 'paused';
    case 'exited':
    case 'dead':
      return 'stopped';
    default:
      return 'not_found';
  }
}

export class DockerAdapter implements ContainerAdapter {
  readonly runtime = 'docker' as const;

  async isAvailable(): Promise<boolean> {
    const client = getClient();
    if (!client) return false;
    try {
      await client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const client = getClient();
    if (!client) return [];

    try {
      const containers = await client.listContainers({ all: true });
      return containers
        .filter(
          (c: any) =>
            c.Names.some((n: string) => n.includes(NANOCLAW_FILTER.namePattern)) ||
            c.Labels?.[NANOCLAW_FILTER.label] !== undefined
        )
        .map((c: any) => ({
          id: c.Id.substring(0, 12),
          name: c.Names[0]?.replace(/^\//, '') || 'unknown',
          image: c.Image,
          status: c.Status,
          state: mapState(c.State),
          created: new Date(c.Created * 1000).toISOString(),
          ports: c.Ports.map(
            (p: any) => `${p.PublicPort || ''}:${p.PrivatePort}/${p.Type}`
          ).filter(Boolean),
          labels: c.Labels || {},
          runtime: 'docker' as const,
        }));
    } catch {
      return [];
    }
  }

  async getStats(containerId: string): Promise<ContainerStats | null> {
    const client = getClient();
    if (!client) return null;

    try {
      const container = client.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        stats.cpu_stats.system_cpu_usage -
        stats.precpu_stats.system_cpu_usage;
      const cpuPercent =
        systemDelta > 0
          ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100
          : 0;

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsage: stats.memory_stats.usage || 0,
        memoryLimit: stats.memory_stats.limit || 0,
        memoryPercent:
          stats.memory_stats.limit > 0
            ? Math.round(
                (stats.memory_stats.usage / stats.memory_stats.limit) * 10000
              ) / 100
            : 0,
        networkRx: Object.values(stats.networks || {}).reduce(
          (sum: number, n: any) => sum + (n.rx_bytes || 0),
          0
        ),
        networkTx: Object.values(stats.networks || {}).reduce(
          (sum: number, n: any) => sum + (n.tx_bytes || 0),
          0
        ),
      };
    } catch {
      return null;
    }
  }

  async startContainer(containerId: string): Promise<boolean> {
    const client = getClient();
    if (!client) return false;
    try {
      const container = client.getContainer(containerId);
      await container.start();
      return true;
    } catch {
      return false;
    }
  }

  async stopContainer(containerId: string): Promise<boolean> {
    const client = getClient();
    if (!client) return false;
    try {
      const container = client.getContainer(containerId);
      await container.stop();
      return true;
    } catch {
      return false;
    }
  }

  async getLogs(containerId: string, lines = 100): Promise<string> {
    const client = getClient();
    if (!client) return '';
    try {
      const container = client.getContainer(containerId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: lines,
      });
      return typeof logs === 'string' ? logs : logs.toString('utf-8');
    } catch {
      return '';
    }
  }

  async exec(containerId: string, command: string[]): Promise<string> {
    const client = getClient();
    if (!client) return '';
    try {
      const container = client.getContainer(containerId);
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ Detach: false });
      return new Promise((resolve) => {
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString('utf-8');
        });
        stream.on('end', () => resolve(output));
        setTimeout(() => resolve(output), 10000);
      });
    } catch {
      return '';
    }
  }
}
