/**
 * OpenRouter MCP tools — registered in-process via `createSdkMcpServer`.
 *
 * Exposes OpenRouter as MCP tools so container agents can query any model
 * available on OpenRouter (GPT-4o, Gemini, DeepSeek, Mistral, Llama, etc.)
 * alongside the native Claude orchestration.
 *
 * Previously this file ran as a separate stdio subprocess (`node openrouter-mcp.js`),
 * but the SDK supports in-process MCP servers via `createSdkMcpServer`, which
 * eliminates subprocess startup cost and per-call JSON-RPC stdio serialization.
 *
 * Credentials are read from `OPENROUTER_API_KEY` in the shared process env.
 *
 * Cost records are written to /workspace/ipc/costs/ using the same format as
 * the SDK's automatic cost tracking, so the host's IPC watcher picks them up
 * and persists them in the central database.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_DEFAULT_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';

const IPC_COSTS_DIR = '/workspace/ipc/costs';

// ---------------------------------------------------------------------------
// Cost tracking — write IPC files the host picks up
// ---------------------------------------------------------------------------

function writeCostRecord(record: {
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd?: number;
  agent_name?: string;
}): void {
  try {
    fs.mkdirSync(IPC_COSTS_DIR, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const tempPath = path.join(IPC_COSTS_DIR, `${filename}.tmp`);
    const finalPath = path.join(IPC_COSTS_DIR, filename);
    const payload = {
      type: 'token_usage',
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      agent_name: record.agent_name || 'openrouter',
      model: `openrouter/${record.model}`,
      tokens_in: record.tokens_in,
      tokens_out: record.tokens_out,
      tokens_cache_read: 0,
      tokens_cache_write: 0,
      container_name: process.env.NANOCLAW_OFFICE || 'unknown',
      cost_usd: record.cost_usd,
    };
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
    fs.renameSync(tempPath, finalPath);
  } catch {
    // Non-fatal — cost tracking failure should not break the tool
  }
}

// ---------------------------------------------------------------------------
// OpenRouter API helpers
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  total_cost?: number;
}

async function openrouterChat(
  model: string,
  messages: ChatMessage[],
  options: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    agentName?: string;
  } = {},
): Promise<{
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  cost_usd?: number;
}> {
  // Read API key fresh each call — the agent-runner may start before env is
  // fully populated (it isn't, but be defensive).
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY not configured. Add it to your .env file.',
    );
  }

  const body: Record<string, unknown> = {
    model,
    messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  if (options.top_p !== undefined) body.top_p = options.top_p;

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nanoclaw.dev',
      'X-Title': 'NanoClaw Agent',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as OpenRouterResponse;

  if (!data.choices || data.choices.length === 0) {
    throw new Error('OpenRouter returned empty response');
  }

  const usage =
    data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  writeCostRecord({
    model: data.model || model,
    tokens_in: usage.prompt_tokens,
    tokens_out: usage.completion_tokens,
    cost_usd: data.total_cost,
    agent_name: options.agentName,
  });

  return {
    content: data.choices[0].message.content,
    model: data.model || model,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
    },
    cost_usd: data.total_cost,
  };
}

interface ModelEntry {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
}

async function listModels(query?: string): Promise<ModelEntry[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }
  const data = (await response.json()) as { data: ModelEntry[] };
  let models = data.data || [];
  if (query) {
    const lower = query.toLowerCase();
    models = models.filter(
      (m) =>
        m.id.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower),
    );
  }
  return models.slice(0, 50);
}

// ---------------------------------------------------------------------------
// SDK-registered MCP server (in-process)
// ---------------------------------------------------------------------------

export const openrouterMcpServer = createSdkMcpServer({
  name: 'openrouter',
  version: '2.0.0',
  tools: [
    tool(
      'openrouter_chat',
      `Send a chat completion to any model available on OpenRouter. Use this when you need a different model for a specific task — for example, a cheaper model for simple classification, or a specialized model for code generation.

Default model: ${OPENROUTER_DEFAULT_MODEL}

Popular models: anthropic/claude-sonnet-4, openai/gpt-4o, google/gemini-2.5-pro, deepseek/deepseek-chat-v3, meta-llama/llama-4-maverick, mistralai/mistral-large, qwen/qwen3.6-plus, stepfun/step-3.5-flash`,
      {
        prompt: z.string().describe('The user/task prompt to send to the model'),
        model: z
          .string()
          .optional()
          .describe(
            `OpenRouter model ID (e.g. "openai/gpt-4o"). Defaults to ${OPENROUTER_DEFAULT_MODEL}`,
          ),
        system: z
          .string()
          .optional()
          .describe('Optional system prompt for the model'),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe('Sampling temperature (0-2). Lower = more deterministic'),
        max_tokens: z
          .number()
          .optional()
          .describe('Maximum tokens in the response'),
        agent_name: z
          .string()
          .optional()
          .describe(
            'Office agent slug you are acting as (e.g. "innovation-reporter"). Used for cost attribution on the dashboard — pass the same slug as the identity file name, without the .md extension.',
          ),
      },
      async (args) => {
        const model = args.model || OPENROUTER_DEFAULT_MODEL;
        const messages: ChatMessage[] = [];
        if (args.system) messages.push({ role: 'system', content: args.system });
        messages.push({ role: 'user', content: args.prompt });
        try {
          const result = await openrouterChat(model, messages, {
            temperature: args.temperature,
            max_tokens: args.max_tokens,
            agentName: args.agent_name,
          });
          const meta = [
            `Model: ${result.model}`,
            `Tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out`,
          ];
          if (result.cost_usd !== undefined) {
            meta.push(`Cost: $${result.cost_usd.toFixed(6)}`);
          }
          return {
            content: [
              { type: 'text' as const, text: result.content },
              { type: 'text' as const, text: `\n---\n${meta.join(' | ')}` },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    ),

    tool(
      'openrouter_multi_turn',
      'Send a multi-turn conversation to any OpenRouter model. Use when you need to provide conversation history (e.g. few-shot examples, prior context).',
      {
        messages: z
          .array(
            z.object({
              role: z.enum(['system', 'user', 'assistant']),
              content: z.string(),
            }),
          )
          .describe('Array of chat messages in order'),
        model: z
          .string()
          .optional()
          .describe(`OpenRouter model ID. Defaults to ${OPENROUTER_DEFAULT_MODEL}`),
        temperature: z.number().min(0).max(2).optional(),
        max_tokens: z.number().optional(),
        agent_name: z
          .string()
          .optional()
          .describe(
            'Office agent slug for cost attribution (e.g. "innovation-reporter").',
          ),
      },
      async (args) => {
        const model = args.model || OPENROUTER_DEFAULT_MODEL;
        try {
          const result = await openrouterChat(model, args.messages, {
            temperature: args.temperature,
            max_tokens: args.max_tokens,
            agentName: args.agent_name,
          });
          const meta = [
            `Model: ${result.model}`,
            `Tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out`,
          ];
          if (result.cost_usd !== undefined) {
            meta.push(`Cost: $${result.cost_usd.toFixed(6)}`);
          }
          return {
            content: [
              { type: 'text' as const, text: result.content },
              { type: 'text' as const, text: `\n---\n${meta.join(' | ')}` },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    ),

    tool(
      'openrouter_list_models',
      'Search available models on OpenRouter. Returns model IDs, pricing, and context window sizes. Use to find the right model for a task.',
      {
        query: z
          .string()
          .optional()
          .describe(
            'Filter models by name or provider (e.g. "gpt-4", "gemini", "deepseek", "llama")',
          ),
      },
      async (args) => {
        try {
          const models = await listModels(args.query);
          if (models.length === 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: args.query
                    ? `No models found matching "${args.query}".`
                    : 'No models available.',
                },
              ],
            };
          }
          const lines = models.map((m) => {
            const promptCost = parseFloat(m.pricing.prompt) * 1_000_000;
            const completionCost = parseFloat(m.pricing.completion) * 1_000_000;
            const ctx = m.context_length
              ? `${Math.round(m.context_length / 1000)}k`
              : '?';
            return `• **${m.id}** — $${promptCost.toFixed(2)}/$${completionCost.toFixed(2)} per 1M tokens | ${ctx} ctx`;
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: `Found ${models.length} model(s):\n\n${lines.join('\n')}`,
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    ),
  ],
});
