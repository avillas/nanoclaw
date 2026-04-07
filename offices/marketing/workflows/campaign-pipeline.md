# Campaign Pipeline — Marketing Office

## Trigger
User sends campaign request via Telegram to Marketing Office group (@marketing).

## Stages

| # | Agent | Action | Gate | On fail |
|---|-------|--------|------|---------|
| 1 | Content Writer | Research + write campaign script | — | — |
| 2 | Content Reviewer | Score campaign (quality-gate) | Score ≥ 7.0 | Return to Content Writer |
| 3 | Instagram Strategist | Adapt to IG format | — | — |
| 4 | Growth Hacker | Viral analysis + score | — | — |
| 5 | Image Prompt Engineer | Create visual prompts/layouts | — | — |
| 6 | Brand Guardian | Brand consistency check | 100% pass | Return to step 5 |
| 7 | Campaign Validator | Consolidate + present for approval | User approval | Return to indicated step |
| 8 | Carousel Publisher | Publish/deliver campaign | — | — |
| 9 | Analytics Engineer | Collect metrics + report | — | Feedback to step 1 |

## Notes
- Steps 1-2 form a review loop (may iterate 1-2 times)
- Steps 5-6 form a brand compliance loop
- Step 7 requires explicit user approval via Telegram
- Step 9 feeds back to step 1 for continuous improvement
