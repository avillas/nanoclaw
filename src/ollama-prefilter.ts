/**
 * Ollama-based message pre-filter.
 *
 * Classifies incoming messages BEFORE spinning up a Claude container, so
 * trivial messages don't burn tokens. Three outcomes:
 *
 *  - `trivial`        — Greeting, ack, off-topic chatter. Optionally send
 *                       a small canned reply, then drop. Saves a full
 *                       container spin-up + Claude turn.
 *  - `simple-answer`  — Self-contained question Ollama can answer (factual,
 *                       definitional, FAQ-like). Ollama replies directly,
 *                       Claude is never invoked.
 *  - `needs-claude`   — Anything substantive: tool use, multi-step work,
 *                       memory access, scheduling, office delegation. Falls
 *                       through to the normal runAgent path.
 *
 * If Ollama is unreachable or the classification fails, we ALWAYS fall
 * through to Claude (fail-open) — never block a user message because the
 * pre-filter had a problem.
 */

import { logger } from './logger.js';
import { ollamaGenerate, ollamaModelAvailable } from './ollama-client.js';

export type Classification = 'trivial' | 'simple-answer' | 'needs-claude';

export interface PrefilterResult {
  classification: Classification;
  /** When `simple-answer`, the answer text Ollama produced. */
  answer?: string;
  /** When `trivial`, optional canned reply (e.g. an emoji ack). */
  cannedReply?: string;
  /** Reason for the decision — useful for logs. */
  reason: string;
  /** True when pre-filter ran successfully (vs. fell through on error). */
  ran: boolean;
}

const CLASSIFIER_SYSTEM = `You are a message classifier for a personal AI assistant called NanoClaw.

Your ONLY job: classify incoming user messages into one of three categories and return a single-line JSON object. Do NOT respond to the message itself.

Categories:
  - "trivial": greetings, acks, emoji-only, off-topic chatter, "thanks", "ok", "👍"
  - "simple-answer": self-contained factual questions you can answer in 1-3 sentences with general knowledge (definitions, common facts, simple math, basic explanations)
  - "needs-claude": anything that requires tools, memory of past conversation, scheduling, code, file access, multi-step reasoning, office delegation, or specialized knowledge

When in doubt, choose "needs-claude" — it is far better to invoke the expensive model than to give a wrong answer.

Output format (strict JSON, single line, no markdown):
{"category": "trivial" | "simple-answer" | "needs-claude", "reason": "<brief reason in english>"}

If category is "simple-answer", ALSO include "answer" with your direct response (max 280 chars):
{"category": "simple-answer", "reason": "...", "answer": "..."}

If category is "trivial" and the message warrants a tiny ack (e.g. greeting), include "ack":
{"category": "trivial", "reason": "...", "ack": "👋"}`;

interface ParsedClassification {
  category?: string;
  reason?: string;
  answer?: string;
  ack?: string;
}

function tryParseClassification(text: string): ParsedClassification | null {
  // Ollama with format:json returns clean JSON, but be defensive.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as ParsedClassification;
  } catch {
    // Try to extract a JSON object from anywhere in the text.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as ParsedClassification;
    } catch {
      return null;
    }
  }
}

/**
 * Strip the trigger pattern from a message body before sending to the
 * classifier — the trigger ("@Andy") is noise for classification.
 */
function stripTrigger(text: string, triggerPattern: RegExp): string {
  return text.replace(triggerPattern, '').trim();
}

export interface PrefilterContext {
  /** Plain user text (not the formatted XML prompt). */
  userText: string;
  triggerPattern: RegExp;
  /** Ollama HTTP host (e.g. "http://172.17.0.1:11434"). */
  ollamaHost: string;
  /** Model to use (e.g. "qwen3:8b"). */
  model: string;
}

/**
 * Run the pre-filter. Always returns a PrefilterResult — on any failure
 * (Ollama down, model missing, parse error, timeout) the classification
 * falls back to "needs-claude" with `ran: false`.
 */
export async function prefilterMessage(
  ctx: PrefilterContext,
): Promise<PrefilterResult> {
  const stripped = stripTrigger(ctx.userText, ctx.triggerPattern);

  // Cheap heuristic short-circuit: empty / whitespace-only / single-char
  // messages don't need Ollama either.
  if (stripped.length === 0) {
    return {
      classification: 'trivial',
      reason: 'empty after trigger strip',
      ran: true,
    };
  }
  if (stripped.length < 2) {
    return {
      classification: 'trivial',
      cannedReply: '👍',
      reason: 'single-char message',
      ran: true,
    };
  }

  // Liveness check before invoking — keeps fail-open path fast.
  const alive = await ollamaModelAvailable(ctx.ollamaHost, ctx.model);
  if (!alive) {
    logger.debug(
      { host: ctx.ollamaHost, model: ctx.model },
      'Ollama unavailable — bypassing pre-filter',
    );
    return {
      classification: 'needs-claude',
      reason: 'ollama unavailable',
      ran: false,
    };
  }

  let raw: string;
  try {
    raw = await ollamaGenerate(ctx.ollamaHost, ctx.model, stripped, {
      system: CLASSIFIER_SYSTEM,
      temperature: 0.1,
      format: 'json',
      maxTokens: 400,
      timeoutMs: 15_000,
    });
  } catch (err) {
    logger.debug(
      { err: (err as Error).message },
      'Ollama generate failed — falling through to Claude',
    );
    return {
      classification: 'needs-claude',
      reason: `ollama error: ${(err as Error).message}`,
      ran: false,
    };
  }

  const parsed = tryParseClassification(raw);
  if (!parsed || !parsed.category) {
    logger.debug({ raw: raw.slice(0, 200) }, 'Pre-filter returned unparseable output');
    return {
      classification: 'needs-claude',
      reason: 'unparseable classifier output',
      ran: false,
    };
  }

  const cat = parsed.category as Classification;
  if (cat !== 'trivial' && cat !== 'simple-answer' && cat !== 'needs-claude') {
    return {
      classification: 'needs-claude',
      reason: `unknown category: ${cat}`,
      ran: false,
    };
  }

  return {
    classification: cat,
    reason: parsed.reason || '(no reason)',
    answer: parsed.answer,
    cannedReply: parsed.ack,
    ran: true,
  };
}
