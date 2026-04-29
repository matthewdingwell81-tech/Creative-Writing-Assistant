#!/bin/bash
set -e

# Install any newly added or updated dependencies.
npm install --no-audit --no-fund

# Apply any new Drizzle schema changes to the database.
# `--force` makes this non-interactive (no destructive prompts).
# NOTE: drizzle.config.ts has tablesFilter: ["!session"] so drizzle-kit
# will never touch the session table, but we recreate it here as a safety
# net in case the database is ever reset.
npm run db:push -- --force

# Ensure the connect-pg-simple session table exists.
# This is not managed by Drizzle — it must be created explicitly.
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS \"session\" (
    \"sid\" varchar NOT NULL COLLATE \"default\",
    \"sess\" json NOT NULL,
    \"expire\" timestamp(6) NOT NULL,
    CONSTRAINT \"session_pkey\" PRIMARY KEY (\"sid\")
  );
  CREATE INDEX IF NOT EXISTS \"IDX_session_expire\" ON \"session\" (\"expire\");
" 2>/dev/null || true
