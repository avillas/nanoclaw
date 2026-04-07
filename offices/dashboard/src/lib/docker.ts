// @deprecated — This file is no longer used. All container logic moved to @/lib/container/
// Safe to delete this file. Kept only because the sandbox cannot rm files.
import Dockerode from 'dockerode';

let docker: Dockerode | null = null;

function getDocker(): Dockerode | null {
  if (docker) return docker;

  try {
    const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    docker = new Dockerode({ socketPath });
    return docker;
  } catch {
    console.warn('[Docker] Could not connect to Docker socket. Using mock data.');
    return null;
  }
}

export async function listNanoClawContainers() {
  const client = getDocker();
  if (!client) return [];

  try {
    const containers = await client.listContainers({ all: true });
    return containers
      .filter(
        (c) =>
          c.Names.some((n) => n.includes('nanoclaw')) ||
          c.Labels?.['com.nanoclaw.office'] !== undefined
      )
      .map((c) => ({
        id: c.Id.substring(0, 12),
        name: c.Names[0]?.replace(/^\//, '') || 'unknown',
        image: c.Image,
        status: c.Status,
        state: mapState(c.State),
        created: new Date(c.Created * 1000).toISOString(),
        ports: c.Ports.map((p) => `${p.PublicPort || ''}:${p.PrivatePort}/${p.Type}`).filter(Boolean),
        labels: c.Labels || {},
      }));
  } catch {
    return [];
  }
}

export async function getContainerStats(containerId: string) {
  const client = getDocker();
  if (!client) return null;

  try {
    const container = client.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100 : 0;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsage: stats.memory_stats.usage || 0,
      memoryLimit: stats.memory_stats.limit || 0,
      memoryPercent: stats.memory_stats.limit > 0
        ? Math.round((stats.memory_stats.usage / stats.memory_stats.limit) * 10000) / 100
        : 0,
      networkRx: Object.values(stats.networks || {}).reduce((sum: number, n: any) => sum + (n.rx_bytes || 0), 0),
      networkTx: Object.values(stats.networks || {}).reduce((sum: number, n: any) => sum + (n.tx_bytes || 0), 0),
    };
  } catch {
    return null;
  }
}

function mapState(state: string): 'running' | 'paused' | 'stopped' | 'not_found' {
  switch (state.toLowerCase()) {
    case 'running': return 'running';
    case 'paused': return 'paused';
    case 'exited':
    case 'dead':
      return 'stopped';
    default:
      return 'not_found';
  }
}
