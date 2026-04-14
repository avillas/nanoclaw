/**
 * Ollama MCP tools — registered in-process via `createSdkMcpServer`.
 *
 * Exposes the host's Ollama daemon as MCP tools so container agents can
 * query local models (qwen, llama, mistral, etc.) without burning Claude
 * or OpenRouter tokens. Ideal for classification, summarization, and
 * deterministic text assembly (e.g. daily reports).
 *
 * Previously this was a stdio subprocess (`node ollama-mcp-stdio.js`).
 * Moving to in-process via the SDK's `createSdkMcpServer` eliminates
 * subprocess spawn overhead and per-call JSON-RPC stdio serialization.
 *
 * Configuration (env vars, shared with the agent-runner process):
 *   OLLAMA_HOST           — URL of the Ollama daemon (default: host gateway)
 *   OLLAMA_ADMIN_TOOLS    — "true" to enable pull/delete/show/list-running
 */

import { createSdkMcpServer, tool, SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const OLLAMA_STATUS_FILE = '/workspace/ipc/ollama_status.json';

function log(msg: string): void {
  process.stderr.write(`[OLLAMA] ${msg}\n`);
}

function writeStatus(status: string, detail?: string): void {
  try {
    const data = { status, detail, timestamp: new Date().toISOString() };
    const tmpPath = `${OLLAMA_STATUS_FILE}.tmp`;
    fs.mkdirSync(path.dirname(OLLAMA_STATUS_FILE), { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(data));
    fs.renameSync(tmpPath, OLLAMA_STATUS_FILE);
  } catch {
    /* best-effort */
  }
}

async function ollamaFetch(
  urlPath: string,
  options?: RequestInit,
): Promise<Response> {
  const host =
    process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
  const url = `${host.replace(/\/$/, '')}${urlPath}`;
  try {
    return await fetch(url, options);
  } catch (err) {
    // Fallback to localhost if host.docker.internal fails
    if (host.includes('host.docker.internal')) {
      const fallbackUrl = url.replace('host.docker.internal', 'localhost');
      return await fetch(fallbackUrl, options);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Core tools — always registered
// ---------------------------------------------------------------------------

const listModelsTool = tool(
  'ollama_list_models',
  'List all locally installed Ollama models. Use this to see which models are available before calling ollama_generate.',
  {},
  async () => {
    log('Listing models...');
    writeStatus('listing', 'Listing available models');
    try {
      const res = await ollamaFetch('/api/tags');
      if (!res.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Ollama API error: ${res.status} ${res.statusText}`,
            },
          ],
          isError: true,
        };
      }
      const data = (await res.json()) as {
        models?: Array<{ name: string; size: number }>;
      };
      const models = data.models || [];
      if (models.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No models installed. Run `ollama pull <model>` on the host to install one.',
            },
          ],
        };
      }
      const list = models
        .map((m) => `- ${m.name} (${(m.size / 1e9).toFixed(1)}GB)`)
        .join('\n');
      log(`Found ${models.length} models`);
      return {
        content: [
          { type: 'text' as const, text: `Installed models:\n${list}` },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Failed to connect to Ollama: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

const generateTool = tool(
  'ollama_generate',
  'Send a prompt to a local Ollama model and get a response. Good for cheaper/faster tasks like summarization, translation, or general queries. Use ollama_list_models first to see available models.',
  {
    model: z
      .string()
      .describe('The model name (e.g., "qwen3:8b", "llama3.2", "mistral")'),
    prompt: z.string().describe('The prompt to send to the model'),
    system: z
      .string()
      .optional()
      .describe('Optional system prompt to set model behavior'),
  },
  async (args) => {
    log(`>>> Generating with ${args.model} (${args.prompt.length} chars)...`);
    writeStatus('generating', `Generating with ${args.model}`);
    try {
      const body: Record<string, unknown> = {
        model: args.model,
        prompt: args.prompt,
        stream: false,
      };
      if (args.system) body.system = args.system;

      const res = await ollamaFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorText = await res.text();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Ollama error (${res.status}): ${errorText}`,
            },
          ],
          isError: true,
        };
      }
      const data = (await res.json()) as {
        response: string;
        total_duration?: number;
        eval_count?: number;
      };
      let meta = '';
      if (data.total_duration) {
        const secs = (data.total_duration / 1e9).toFixed(1);
        meta = `\n\n[${args.model} | ${secs}s${data.eval_count ? ` | ${data.eval_count} tokens` : ''}]`;
        log(
          `<<< Done: ${args.model} | ${secs}s | ${data.eval_count || '?'} tokens | ${data.response.length} chars`,
        );
        writeStatus(
          'done',
          `${args.model} | ${secs}s | ${data.eval_count || '?'} tokens`,
        );
      } else {
        log(`<<< Done: ${args.model} | ${data.response.length} chars`);
        writeStatus('done', `${args.model} | ${data.response.length} chars`);
      }
      return {
        content: [{ type: 'text' as const, text: data.response + meta }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Failed to call Ollama: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Admin tools — only registered when OLLAMA_ADMIN_TOOLS=true
// ---------------------------------------------------------------------------

const adminTools: SdkMcpToolDefinition<any>[] =
  process.env.OLLAMA_ADMIN_TOOLS === 'true'
    ? [
        tool(
          'ollama_pull_model',
          'Pull (download) a model from the Ollama registry by name. Returns the final status once the pull is complete.',
          {
            model: z
              .string()
              .describe('Model name, e.g. "qwen3:8b", "llama3.2", "gemma2:9b"'),
          },
          async (args) => {
            log(`Pulling model: ${args.model}...`);
            writeStatus('pulling', `Pulling ${args.model}`);
            try {
              const res = await ollamaFetch('/api/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: args.model, stream: false }),
              });
              if (!res.ok) {
                const errorText = await res.text();
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Ollama error (${res.status}): ${errorText}`,
                    },
                  ],
                  isError: true,
                };
              }
              const data = (await res.json()) as { status: string };
              log(`Pull complete: ${args.model} — ${data.status}`);
              writeStatus('done', `Pulled ${args.model}`);
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Pull complete: ${args.model} — ${data.status}`,
                  },
                ],
              };
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Failed to pull model: ${err instanceof Error ? err.message : String(err)}`,
                  },
                ],
                isError: true,
              };
            }
          },
        ),

        tool(
          'ollama_delete_model',
          'Delete a locally installed Ollama model to free up disk space.',
          {
            model: z
              .string()
              .describe('Model name to delete, e.g. "llama3.2", "mistral:latest"'),
          },
          async (args) => {
            log(`Deleting model: ${args.model}...`);
            writeStatus('deleting', `Deleting ${args.model}`);
            try {
              const res = await ollamaFetch('/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: args.model }),
              });
              if (!res.ok) {
                const errorText = await res.text();
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Ollama error (${res.status}): ${errorText}`,
                    },
                  ],
                  isError: true,
                };
              }
              log(`Deleted: ${args.model}`);
              writeStatus('done', `Deleted ${args.model}`);
              return {
                content: [
                  { type: 'text' as const, text: `Deleted model: ${args.model}` },
                ],
              };
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Failed to delete model: ${err instanceof Error ? err.message : String(err)}`,
                  },
                ],
                isError: true,
              };
            }
          },
        ),

        tool(
          'ollama_show_model',
          'Show details for a locally installed Ollama model: modelfile, parameters, template, system prompt, and architecture info.',
          {
            model: z.string().describe('Model name to inspect'),
          },
          async (args) => {
            log(`Showing model info: ${args.model}...`);
            try {
              const res = await ollamaFetch('/api/show', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: args.model }),
              });
              if (!res.ok) {
                const errorText = await res.text();
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Ollama error (${res.status}): ${errorText}`,
                    },
                  ],
                  isError: true,
                };
              }
              const data = await res.json();
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(data, null, 2) },
                ],
              };
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Failed to show model info: ${err instanceof Error ? err.message : String(err)}`,
                  },
                ],
                isError: true,
              };
            }
          },
        ),

        tool(
          'ollama_list_running',
          'List Ollama models currently loaded in memory with their memory usage, processor type (CPU/GPU), and time until they are unloaded.',
          {},
          async () => {
            log('Listing running models...');
            try {
              const res = await ollamaFetch('/api/ps');
              if (!res.ok) {
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Ollama error (${res.status})`,
                    },
                  ],
                  isError: true,
                };
              }
              const data = (await res.json()) as {
                models?: Array<{
                  name: string;
                  size: number;
                  size_vram: number;
                  processor: string;
                  expires_at: string;
                }>;
              };
              const models = data.models || [];
              if (models.length === 0) {
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: 'No models currently loaded in memory.',
                    },
                  ],
                };
              }
              const list = models
                .map((m) => {
                  const size = m.size_vram > 0 ? m.size_vram : m.size;
                  return `- ${m.name} (${(size / 1e9).toFixed(1)}GB ${m.processor}, unloads at ${m.expires_at})`;
                })
                .join('\n');
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Models loaded in memory:\n${list}`,
                  },
                ],
              };
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Failed to list running models: ${err instanceof Error ? err.message : String(err)}`,
                  },
                ],
                isError: true,
              };
            }
          },
        ),
      ]
    : [];

if (adminTools.length > 0) {
  log('Admin tools enabled (pull, delete, show, list-running)');
}

// ---------------------------------------------------------------------------
// SDK-registered MCP server (in-process)
// ---------------------------------------------------------------------------

export const ollamaMcpServer = createSdkMcpServer({
  name: 'ollama',
  version: '2.0.0',
  tools: [listModelsTool, generateTool, ...adminTools],
});
