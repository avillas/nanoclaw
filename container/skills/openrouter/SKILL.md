---
name: openrouter
description: Query any AI model via OpenRouter — GPT-4o, Gemini, DeepSeek, Mistral, Llama, and 200+ others. Use for cost optimization, model comparison, or accessing capabilities Claude doesn't have.
---

# OpenRouter — Multi-Model Access

You have access to **OpenRouter** via MCP tools. This lets you query any model available on OpenRouter's catalog alongside your native Claude capabilities.

## When to Use

- **Cost optimization**: Delegate simple tasks (classification, extraction, translation) to cheaper models like `deepseek/deepseek-chat-v3` or `meta-llama/llama-4-maverick`
- **Model comparison**: Get a second opinion from a different model family
- **Specialized tasks**: Use models optimized for specific domains (code, math, multilingual)
- **Capacity**: Offload sub-tasks when you need parallel processing

## Available Tools

### `mcp__openrouter__openrouter_chat`

Single-turn chat completion. Simplest way to query a model.

```
prompt: "Classify this text as positive/negative/neutral: ..."
model: "deepseek/deepseek-chat-v3"  (optional, defaults to claude-sonnet-4)
system: "You are a sentiment classifier."  (optional)
temperature: 0  (optional, 0-2)
max_tokens: 100  (optional)
```

### `mcp__openrouter__openrouter_multi_turn`

Multi-turn conversation with message history. Use for few-shot prompting or context-dependent tasks.

```
messages: [
  { role: "system", content: "You are a translator." },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Olá" },
  { role: "user", content: "How are you?" }
]
model: "openai/gpt-4o"
```

### `mcp__openrouter__openrouter_list_models`

Search the model catalog to find the right model for a task.

```
query: "deepseek"  (optional filter)
```

## Popular Models

| Model ID | Best For | Cost (in/out per 1M) |
|----------|----------|---------------------|
| `openai/gpt-4o` | General purpose | $2.50 / $10.00 |
| `openai/gpt-4o-mini` | Fast & cheap | $0.15 / $0.60 |
| `google/gemini-2.5-pro` | Long context, reasoning | $1.25 / $10.00 |
| `google/gemini-2.5-flash` | Fast & cheap | $0.15 / $0.60 |
| `deepseek/deepseek-chat-v3` | Code, math, reasoning | $0.27 / $1.10 |
| `meta-llama/llama-4-maverick` | Open-weight, general | $0.20 / $0.60 |
| `mistralai/mistral-large` | Multilingual, EU compliance | $2.00 / $6.00 |
| `anthropic/claude-sonnet-4` | Via OpenRouter billing | $3.00 / $15.00 |

Use `openrouter_list_models` for current pricing — these are approximate.

## Cost Tracking

Every OpenRouter call automatically records token usage and cost to the IPC system. The dashboard tracks OpenRouter costs alongside Claude costs under the `openrouter/*` model prefix.

## Guidelines

1. **Don't replace your own reasoning** — you (Claude) are the orchestrator. Use OpenRouter for delegated sub-tasks, not for replacing your judgment.
2. **Choose the right model** — cheaper isn't always better. Match model capability to task complexity.
3. **Include context** — OpenRouter models don't share your conversation. Pass all needed context in the prompt.
4. **Check costs** — use `openrouter_list_models` to verify pricing before sending large prompts to expensive models.
