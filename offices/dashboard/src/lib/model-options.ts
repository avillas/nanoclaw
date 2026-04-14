/**
 * Centralized model catalog for agent/office configuration.
 *
 * Grouped by provider so the UI can render an `<optgroup>` and the user
 * can pick from Anthropic (native), local Ollama, or any OpenRouter model.
 *
 * OpenRouter models are stored with their full slug (e.g. `qwen/qwen3.6-plus`)
 * — the agent-runner detects the `/` and routes them through the
 * OpenRouter MCP proxy with haiku as the orchestration model.
 */

export interface ModelOption {
  value: string;
  label: string;
  desc?: string;
}

export interface ModelGroup {
  group: string;
  options: ModelOption[];
}

/** Anthropic models — run natively via the Claude Agent SDK. */
export const ANTHROPIC_MODELS: ModelOption[] = [
  { value: 'haiku', label: 'Claude Haiku', desc: 'Fast, cheap — validation, formatting' },
  { value: 'sonnet', label: 'Claude Sonnet', desc: 'Balanced — creation, analysis, implementation' },
  { value: 'opus', label: 'Claude Opus', desc: 'Most capable — complex decisions only' },
];

/** Local Ollama models — zero cost, runs on host. */
export const OLLAMA_MODELS: ModelOption[] = [
  { value: 'ollama-llama3.2', label: 'Ollama Llama 3.2', desc: 'Local — classification, tagging' },
  { value: 'ollama-qwen3', label: 'Ollama Qwen3', desc: 'Local — summarization, extraction' },
];

/**
 * Curated OpenRouter models. Grouped by provider for the dropdown.
 * Pricing references are USD per 1M tokens (input/output) at time of writing.
 *
 * To add more, append here. Any OpenRouter model ID works — the agent-runner
 * does not validate against this list.
 */
export const OPENROUTER_MODELS: ModelOption[] = [
  // Anthropic via OpenRouter (alternate billing)
  { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4 (OR)', desc: '$15 / $75' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 (OR)', desc: '$3 / $15' },
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5 (OR)', desc: '$1 / $5' },

  // OpenAI
  { value: 'openai/gpt-4o', label: 'GPT-4o', desc: '$2.50 / $10' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', desc: '$0.15 / $0.60' },
  { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', desc: '$10 / $30' },
  { value: 'openai/o1', label: 'OpenAI o1', desc: '$15 / $60' },
  { value: 'openai/o1-mini', label: 'OpenAI o1-mini', desc: '$3 / $12' },

  // Google
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: '$1.25 / $10' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: '$0.15 / $0.60' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: '$0.075 / $0.30' },

  // Qwen
  { value: 'qwen/qwen3.6-plus', label: 'Qwen 3.6 Plus', desc: '$0.50 / $2.00' },
  { value: 'qwen/qwen3-coder', label: 'Qwen3 Coder', desc: '$0.40 / $1.60' },
  { value: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B Instruct', desc: '$0.35 / $0.40' },

  // DeepSeek
  { value: 'deepseek/deepseek-chat-v3', label: 'DeepSeek Chat v3', desc: '$0.27 / $1.10' },
  { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1 (reasoning)', desc: '$0.55 / $2.19' },

  // Meta Llama
  { value: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', desc: '$0.20 / $0.60' },
  { value: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout', desc: '$0.15 / $0.50' },
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', desc: '$0.20 / $0.60' },

  // Mistral
  { value: 'mistralai/mistral-large', label: 'Mistral Large', desc: '$2.00 / $6.00' },
  { value: 'mistralai/mistral-medium', label: 'Mistral Medium', desc: '$0.40 / $2.00' },
  { value: 'mistralai/codestral-2508', label: 'Codestral', desc: '$0.30 / $0.90' },

  // StepFun
  { value: 'stepfun/step-3.5-flash', label: 'StepFun Step 3.5 Flash', desc: '$0.13 / $0.50' },
  { value: 'stepfun/step-3', label: 'StepFun Step 3', desc: '$1.00 / $4.00' },

  // xAI
  { value: 'x-ai/grok-4', label: 'Grok 4', desc: '$3 / $15' },
  { value: 'x-ai/grok-4-mini', label: 'Grok 4 Mini', desc: '$0.30 / $0.50' },

  // Cohere
  { value: 'cohere/command-r-plus', label: 'Command R+', desc: '$2.50 / $10' },
  { value: 'cohere/command-r', label: 'Command R', desc: '$0.15 / $0.60' },

  // Perplexity
  { value: 'perplexity/sonar-pro', label: 'Perplexity Sonar Pro', desc: '$3 / $15' },
  { value: 'perplexity/sonar', label: 'Perplexity Sonar', desc: '$1 / $1' },
];

/** All model groups, in the order they should appear in dropdowns. */
export const MODEL_GROUPS: ModelGroup[] = [
  { group: 'Anthropic (native)', options: ANTHROPIC_MODELS },
  { group: 'Local (Ollama)', options: OLLAMA_MODELS },
  { group: 'OpenRouter', options: OPENROUTER_MODELS },
];

/** Flat list — useful for type-checking or simple iteration. */
export const ALL_MODEL_OPTIONS: ModelOption[] = [
  ...ANTHROPIC_MODELS,
  ...OLLAMA_MODELS,
  ...OPENROUTER_MODELS,
];

/** Lookup label for any model value, falling back to the value itself. */
export function getModelLabel(value: string): string {
  const found = ALL_MODEL_OPTIONS.find((m) => m.value === value);
  return found ? found.label : value;
}
