/**
 * Minimal Ollama HTTP client for the host orchestrator.
 *
 * Used by the pre-filter to classify inbound messages and answer trivial
 * ones without spinning up a Claude container. Talks directly to the Ollama
 * REST API via fetch — no SDK dependency.
 *
 * The container side uses container/agent-runner/src/ollama-mcp-stdio.ts
 * (separate, MCP-based). This module is host-only.
 */

import { logger } from './logger.js';

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaGenerateOptions {
  /** Optional system prompt to set behavior/role. */
  system?: string;
  /** Sampling temperature (default Ollama: 0.8). Lower = deterministic. */
  temperature?: number;
  /** Max output tokens. Ollama uses `num_predict`. */
  maxTokens?: number;
  /** Force JSON output (Ollama-native, makes parsing reliable). */
  format?: 'json';
  /** Override model from the default. */
  timeoutMs?: number;
}

/**
 * Send a single-turn prompt to a local Ollama model.
 * Returns the raw response text; the caller is responsible for parsing.
 */
export async function ollamaGenerate(
  host: string,
  model: string,
  prompt: string,
  options: OllamaGenerateOptions = {},
): Promise<string> {
  const url = `${host.replace(/\/$/, '')}/api/generate`;
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
  };
  if (options.system) body.system = options.system;
  if (options.format) body.format = options.format;
  const opts: Record<string, unknown> = {};
  if (options.temperature !== undefined) opts.temperature = options.temperature;
  if (options.maxTokens !== undefined) opts.num_predict = options.maxTokens;
  if (Object.keys(opts).length > 0) body.options = opts;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 20_000,
  );

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as OllamaGenerateResponse;
    return data.response.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe Ollama liveness. Returns true if the server is reachable and the
 * named model is installed.
 */
export async function ollamaModelAvailable(
  host: string,
  model: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const names = (data.models || []).map((m) => m.name);
    // Allow tag suffix flexibility: "qwen3:8b" matches "qwen3:8b" or "qwen3:8b-q4_K_M"
    return names.some(
      (n) => n === model || n.startsWith(`${model.split(':')[0]}:`),
    );
  } catch (err) {
    logger.debug(
      { err: (err as Error).message, host, model },
      'Ollama probe failed',
    );
    return false;
  }
}
