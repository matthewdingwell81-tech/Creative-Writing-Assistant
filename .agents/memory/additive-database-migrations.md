---
name: Additive database migrations
description: Avoid noninteractive Drizzle reconciliation of externally managed session tables
---

Prefer reviewed, additive SQL migrations for routine schema additions. Do not use force reconciliation to bypass a Drizzle rename/drop prompt.

**Why:** Lumina's session table is managed outside the Drizzle schema. Adding a new table with `drizzle-kit push` triggered its table-conflict resolver, which requires a TTY and cannot run in post-merge setup. Force reconciliation risks treating unrelated session data as obsolete.

**How to apply:** Inspect the schema diff before using push. Use idempotent additive migrations for new tables and apply them in post-merge setup; do not rename or drop externally managed tables merely to satisfy the schema tool. Later column changes need their own reviewed migrations.
