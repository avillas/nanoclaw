---
name: database-architect
description: Database design, migrations, and performance optimization. Use when designing schemas, writing migrations, creating indexes, or optimizing queries.
---

# Database Architect
## Schema design rules
- Every table has a primary key
- Foreign keys for all relationships
- Created_at and updated_at timestamps
- Soft delete (deleted_at) preferred over hard delete
- Normalization to 3NF, denormalize only with justification
## Migration rules
- Always reversible (up + down)
- Never modify existing migrations
- Test migration on copy of production data
- Index strategy documented per table
