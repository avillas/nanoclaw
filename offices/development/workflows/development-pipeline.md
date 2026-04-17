# Development Pipeline — Development Office

## Trigger
User sends development request via Telegram (@dev) or handoff from Innovation Office.

## Stages

| # | Agent | Action | Gate | On fail |
|---|-------|--------|------|---------|
| 1 | Product Manager | Specify epics + user stories | — | — |
| 2 | Product Reviewer | Validate against vision/roadmap | Score ≥ 7.0 | Return to PM |
| 3 | Codebase Mapper | Map code structure, deps, design surface of affected projects | — | — |
| 4 | UX Architect | Design user flows + wireframes (informed by design surface from Mapper) | — | — |
| 5 | UI Designer | Visual components + design tokens (extending existing system) | — | — |
| 6 | Software Architect | Task decomposition + ADRs (informed by codebase map) | — | — |
| 7 | Engineering Manager | Execution plan + acceptance criteria | — | — |
| 8a | Frontend Developer | Implement frontend tasks | — | — |
| 8b | Backend Developer | Implement backend tasks | — | — |
| 8c | Database Architect | Schema + migrations | — | — |
| 9 | QA Engineer | Test all implementations | All tests pass | Return to 8x |
| 10 | Security Engineer | Security review | APPROVED | Return to 8x |
| 11 | DevOps Engineer | Deploy to production | — | — |
| 12 | Technical Writer | Update documentation | — | — |

## Notes
- Step 3 (Codebase Mapper) runs early to give UX/UI/Architect context of existing code and design system before they propose extensions
- Steps 8a, 8b, 8c execute in PARALLEL
- Steps 9-10 are sequential gates (QA first, then security)
- All implementation steps (8-11) follow git-workflow skill
- Every code change requires a PR (pull-request skill)
- Merge requires human approval

## Standalone (fora do pipeline)

Agentes com `pipeline_position: 99` são invocados diretamente pelo orquestrador quando o request matches seu domínio, sem passar pelo pipeline completo:

| Agent | Trigger |
|-------|---------|
| ClickUp Project Manager | Requests sobre ClickUp, sprints, tasks, burndown, reports gerenciais |
