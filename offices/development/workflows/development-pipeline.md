# Development Pipeline — Development Office

## Trigger
User sends development request via Telegram (@dev) or handoff from Innovation Office.

## Stages

| # | Agent | Action | Gate | On fail |
|---|-------|--------|------|---------|
| 1 | Product Manager | Specify epics + user stories | — | — |
| 2 | Product Reviewer | Validate against vision/roadmap | Score ≥ 7.0 | Return to PM |
| 3 | UX Architect | Design user flows + wireframes | — | — |
| 4 | UI Designer | Visual components + design tokens | — | — |
| 5 | Software Architect | Task decomposition + ADRs | — | — |
| 6 | Engineering Manager | Execution plan + acceptance criteria | — | — |
| 7a | Frontend Developer | Implement frontend tasks | — | — |
| 7b | Backend Developer | Implement backend tasks | — | — |
| 7c | Database Architect | Schema + migrations | — | — |
| 8 | QA Engineer | Test all implementations | All tests pass | Return to 7x |
| 9 | Security Engineer | Security review | APPROVED | Return to 7x |
| 10 | DevOps Engineer | Deploy to production | — | — |
| 11 | Technical Writer | Update documentation | — | — |

## Notes
- Steps 7a, 7b, 7c execute in PARALLEL
- Steps 8-9 are sequential gates (QA first, then security)
- All implementation steps (7-10) follow git-workflow skill
- Every code change requires a PR (pull-request skill)
- Merge requires human approval
