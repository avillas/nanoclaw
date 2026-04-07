---
name: git-workflow
description: Git workflow rules for Bitbucket integration. Use whenever an agent interacts with Git — creating branches, making commits, or preparing PRs. Agents MUST follow these rules.
---

# Git Workflow

## Branch: agent/{agent-name}/{task-id}-{description}
## Commits: type(scope): description (feat, fix, refactor, test, docs, chore)
## NEVER: push to main/develop, force push, delete branches
## ALWAYS: create from develop, atomic commits, open PR after task
