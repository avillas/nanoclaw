---
name: memory-gps
description: Manage MEMORY.md as a GPS-style index of topic files. Use this skill when initializing a session, storing new knowledge, or retrieving past context. MEMORY.md contains ONLY pointers, never raw content.
---

# Memory GPS

## Rules

1. On session init: load ONLY CLAUDE.md + MEMORY.md. Nothing else.
2. To find context: read MEMORY.md pointers, then memory_search() for content
3. To store knowledge: write to topic file, update MEMORY.md pointer
4. Daily notes go to daily/{date}.md (volatile)
5. Topic files: one file per topic (durable)
6. NEVER load full topic files unless needed for current task
7. MEMORY.md must stay under 2KB
