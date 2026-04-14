---
name: daily-report
description: Generate a daily summary report for an office. Use as cron job at end of day to compile tasks, token usage, and costs. Delivers via Telegram. Compiled by local Ollama (zero token cost) — only the orchestration runs on Claude.
---

# Daily Report

This skill produces an end-of-day summary for an office and delivers it via
Telegram. The expensive reasoning (data gathering decisions) stays in the
orchestrator; the heavy text assembly is **delegated to local Ollama** so the
recurring daily run does not consume API tokens.

## Output format

```
📊 Daily report: [Office] — [Date]
Completed: [count + list]
In progress: [count + list]
Blocked: [count + reasons]
Cost: Today $X / $Y (Z%) | Month $X / $Y (Z%)
Model mix: Haiku X% | Sonnet X% | Opus X% | OpenRouter X% | Ollama X%
```

## Recommended pipeline

1. **Gather raw data yourself** (do NOT delegate this — it needs structured
   tool use):
   - Read pipeline artifacts from `/workspace/group/`
   - Query the database for today's `agent_costs` and `pipeline_executions`
     via the `mcp__nanoclaw__*` tools
   - Read any blocked-task notes
2. **Compile the report with Ollama** (this is the cost-saving step):
   - Prefer model `qwen3:8b` (good multi-language, reliable formatting)
   - Fall back to `llama3.2:3b` if 8B is not installed
   - Call:
     ```
     mcp__ollama__ollama_generate
       model: "qwen3:8b"
       system: "You are a technical writer. Format the input data into the
                exact template shown below. Be concise. Do not invent numbers.
                Output language: pt-BR. Markdown light (Telegram-style)."
       prompt: <raw data> + <template>
     ```
3. **Send via channel** — pass the Ollama output to `mcp__nanoclaw__send_message`.

## Why Ollama for compilation

- This is a recurring, deterministic task (runs every day on a cron).
- The numbers and lists already exist — the model only needs to format them.
- A 7-8B local model handles formatting reliably without consuming API tokens.
- Saves ~$0.10–$0.50 per run depending on office size — adds up to dozens
  of dollars per month per office.

## Fallback

If `mcp__ollama__ollama_generate` errors (Ollama down, model not pulled),
fall back to the default model. Do NOT silently fail the daily report —
the user expects it daily.

## Trigger

This skill is intended to be invoked by a scheduled task. Example cron:
```
schedule_value: "0 18 * * *"   # Every day at 18:00 office-local time
prompt: "Run /daily-report for this office and send to the main channel."
```
