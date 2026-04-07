// ============================================================================
// NanoClaw Mission Control — Container Runtime Abstraction
// ============================================================================

import type { ContainerInfo, ContainerStats, ContainerRuntime } from '@/types';

/**
 * Unified interface for container runtimes.
 * Implementations: DockerAdapter (Linux/macOS), AppleContainerAdapter (macOS 26+)
 */
export interface ContainerAdapter {
  readonly runtime: ContainerRuntime;

  /** Check if this runtime is available on the current system */
  isAvailable(): Promise<boolean>;

  /** List all NanoClaw containers (filtered by label or name convention) */
  listContainers(): Promise<ContainerInfo[]>;

  /** Get live resource stats for a running container */
  getStats(containerId: string): Promise<ContainerStats | null>;

  /** Start a stopped container */
  startContainer(containerId: string): Promise<boolean>;

  /** Stop a running container (graceful) */
  stopContainer(containerId: string): Promise<boolean>;

  /** Get container logs */
  getLogs(containerId: string, lines?: number): Promise<string>;

  /** Execute a command inside a running container */
  exec(containerId: string, command: string[]): Promise<string>;
}

/** Filter criteria for NanoClaw containers */
export const NANOCLAW_FILTER = {
  label: 'com.nanoclaw.office',
  namePattern: 'nanoclaw',
} as const;
