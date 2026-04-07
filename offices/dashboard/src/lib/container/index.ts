// ============================================================================
// NanoClaw Mission Control — Container Runtime Factory
// ============================================================================
//
// Auto-detects the available container runtime:
//   1. If CONTAINER_RUNTIME env var is set, use that ("docker" | "apple-container")
//   2. Try Apple Container CLI first (macOS-native, preferred on macOS 26+)
//   3. Fall back to Docker
//   4. If neither is available, return a no-op adapter that returns empty results
//
// Usage:
//   import { getContainerRuntime } from '@/lib/container';
//   const runtime = await getContainerRuntime();
//   const containers = await runtime.listContainers();
// ============================================================================

import type { ContainerInfo, ContainerStats } from '@/types';
import type { ContainerAdapter } from './types';
import { DockerAdapter } from './docker-adapter';
import { AppleContainerAdapter } from './apple-container-adapter';

export type { ContainerAdapter } from './types';

// Singleton — detected once, cached for the process lifetime
let _cached: ContainerAdapter | null = null;
let _detecting = false;

/** No-op adapter when no container runtime is available */
class MockAdapter implements ContainerAdapter {
  readonly runtime = 'mock' as const;
  async isAvailable() { return true; }
  async listContainers(): Promise<ContainerInfo[]> { return []; }
  async getStats(): Promise<ContainerStats | null> { return null; }
  async startContainer() { return false; }
  async stopContainer() { return false; }
  async getLogs() { return ''; }
  async exec() { return ''; }
}

/**
 * Detect and return the container runtime adapter.
 * Result is cached — safe to call on every request.
 */
export async function getContainerRuntime(): Promise<ContainerAdapter> {
  if (_cached) return _cached;

  // Prevent parallel detection races
  if (_detecting) {
    await new Promise((r) => setTimeout(r, 100));
    if (_cached) return _cached;
  }
  _detecting = true;

  try {
    const forced = process.env.CONTAINER_RUNTIME?.toLowerCase();

    if (forced === 'docker') {
      const adapter = new DockerAdapter();
      if (await adapter.isAvailable()) {
        _cached = adapter;
        console.log('[Container] Using Docker runtime (forced by env)');
        return _cached;
      }
    }

    if (forced === 'apple-container' || forced === 'apple') {
      const adapter = new AppleContainerAdapter();
      if (await adapter.isAvailable()) {
        _cached = adapter;
        console.log('[Container] Using Apple Container runtime (forced by env)');
        return _cached;
      }
    }

    // Auto-detect: try Apple Container first (native on macOS), then Docker
    if (!forced) {
      const apple = new AppleContainerAdapter();
      if (await apple.isAvailable()) {
        _cached = apple;
        console.log('[Container] Detected Apple Container runtime');
        return _cached;
      }

      const docker = new DockerAdapter();
      if (await docker.isAvailable()) {
        _cached = docker;
        console.log('[Container] Detected Docker runtime');
        return _cached;
      }
    }

    console.warn('[Container] No container runtime found. Using mock adapter.');
    _cached = new MockAdapter();
    return _cached;
  } finally {
    _detecting = false;
  }
}

/**
 * Convenience: list NanoClaw containers using the detected runtime.
 * Drop-in replacement for the old listNanoClawContainers().
 */
export async function listNanoClawContainers(): Promise<ContainerInfo[]> {
  const runtime = await getContainerRuntime();
  return runtime.listContainers();
}

/**
 * Convenience: get container stats using the detected runtime.
 * Drop-in replacement for the old getContainerStats().
 */
export async function getContainerStats(
  containerId: string
): Promise<ContainerStats | null> {
  const runtime = await getContainerRuntime();
  return runtime.getStats(containerId);
}
