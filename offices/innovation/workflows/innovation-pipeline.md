# Innovation Pipeline — Innovation Office

## Trigger
Daily cron (7:00 AM) for Trend Researcher, or manual trigger via Telegram (@innovation).

## Stages

| # | Agent | Action | Gate | On fail |
|---|-------|--------|------|---------|
| 1 | Trend Researcher | Market scan + opportunity briefs | — | — |
| 2 | Competitive Intelligence | Competitive landscape analysis | — | — |
| 3 | Technology Scout | Technology feasibility scan | — | — |
| 4 | Business Case Builder | Build business case | — | — |
| 5 | Opportunity Validator | Critical analysis + score | Score ≥ 5.0 | Archive |
| 6 | Innovation Reporter | Compile report + present | User approval | Archive |
| 7 | (Handoff) | → Development Office | — | — |

## Notes
- Steps 1-4 build cumulative knowledge (use /workspace/extra/office-shared/ for continuity)
- Step 5 filters: only scored ≥ 5.0 advance to user
- Step 6 requires explicit user approval via Telegram
- Step 7 uses handoff-to-office skill to send to Development Office
- Cron schedule: Trend Researcher daily, Competitive Intelligence weekly (Monday)
- Weekly summary report: Innovation Reporter on Friday 5PM
