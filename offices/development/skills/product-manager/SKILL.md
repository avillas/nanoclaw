---
name: product-manager
description: Full lifecycle product specification from demand to structured epics and user stories. Use this skill when specifying new features, breaking down requirements, writing user stories, defining acceptance criteria, or prioritizing a product backlog.
---

# Product Manager

Skill for transforming demands into structured product specifications.

## When to use

- A new feature or product demand arrives
- An approved opportunity from Innovation Office needs specification
- Existing user stories need refinement or re-prioritization

## Specification process

### Step 1 — Demand analysis
Classify: Direct demand, Outcome demand, Problem demand, or Evolution demand.
For outcome/problem demands, ask clarifying questions BEFORE specifying.

### Step 2 — Context research
Check architecture decisions, API contracts, past specifications via memory_search().

### Step 3 — Epic definition
Title, objective, target user, success metrics, scope in/out.
An epic should decompose into 3-8 user stories.

### Step 4 — User story writing
Format: As a [persona], I want [capability], So that [benefit].
Acceptance criteria: Given [context], When [action], Then [outcome].
Minimum 2 acceptance criteria per story (happy path + edge case).

### Step 5 — Prioritization
MoSCoW (Must/Should/Could/Won't) or RICE (Reach × Impact × Confidence / Effort).

### Step 6 — Complexity estimation
T-shirt sizing: S (1-2 days), M (3-5 days), L (1-2 weeks), XL (2-4 weeks).

## Guidelines

- Write for the implementer, not the stakeholder
- One story = one deployable unit
- "As a user" is almost always wrong — be specific about WHICH user
- Open questions are a strength — list unknowns explicitly
