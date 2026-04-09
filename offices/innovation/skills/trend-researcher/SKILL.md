---
name: trend-researcher
description: Market trend research and opportunity identification. Use this skill when scanning for market opportunities, analyzing product trends, evaluating market demand, tracking growth signals, or building opportunity briefs.
---

# Trend Researcher

Skill for systematic market research, trend identification, and opportunity scoring.

## When to use

- Running a scheduled market scan (daily/weekly cron)
- Investigating a specific market segment
- Building an opportunity brief for team evaluation

## Research methodology

### Phase 1 — Source scanning
Scan product signals, tech signals, market data, consumer signals, startup signals. Limit 2 searches per category.

### Phase 2 — Signal classification
Signal (1-2 data points) → watchlist. Trend (3+ data points) → opportunity brief. Noise → discard. Saturated → archive.

### Phase 3 — Opportunity scoring
Market demand (25%) + Growth trajectory (25%) + Competition gap (20%) + Technical feasibility (15%) + Strategic fit (15%).
Score ≥ 7: HIGH priority. Score 5-6.9: MEDIUM. Score < 5: LOW.

### Phase 4 — Continuity tracking
Maintain running watchlist. Promote signals with 3+ data points. Archive stale signals after 3 cycles.

## Guidelines

- Evidence beats intuition. No data = no finding.
- "Trending on Product Hunt" is a signal, not a trend
- Save ALL research to /workspace/group/trends/ for cross-session continuity (writable, per-group; /workspace/extra/office-shared/ is read-only and will fail)
