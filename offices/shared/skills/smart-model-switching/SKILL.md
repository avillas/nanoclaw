---
name: smart-model-switching
description: Automatically select the optimal LLM model (Haiku/Sonnet/Opus/Local) based on task complexity. Use this skill to minimize token costs while maintaining output quality.
---

# Smart Model Switching

## Decision rules

- Level 1 → Haiku: formatting, classification, extraction, health checks, documentation
- Level 2 → Sonnet (default): content creation, code implementation, analysis, review
- Level 3 → Opus (rare, justify): 3+ competing trade-offs, irreversible decisions, cross-domain synthesis

Rule: start low, escalate if needed. 80% of tasks should run on Haiku or Sonnet. Opus < 5% of total calls.
