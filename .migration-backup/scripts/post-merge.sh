#!/bin/bash
set -e

# Install any newly added or updated dependencies.
npm install --no-audit --no-fund

# Apply any new Drizzle schema changes to the database.
# `--force` makes this non-interactive (no destructive prompts).
# NOTE: drizzle.config.ts has tablesFilter: ["!session"] so drizzle-kit
# will never touch the session table.
npm run db:push -- --force

# Ensure the connect-pg-simple session table exists.
# This is not managed by Drizzle — it must be created explicitly.
# The server startup also calls ensureSessionTable(), but we do it here
# as well so the table exists before the server first boots after a merge.
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS \"session\" (
    \"sid\" varchar NOT NULL COLLATE \"default\",
    \"sess\" json NOT NULL,
    \"expire\" timestamp(6) NOT NULL,
    CONSTRAINT \"session_pkey\" PRIMARY KEY (\"sid\")
  );
  CREATE INDEX IF NOT EXISTS \"IDX_session_expire\" ON \"session\" (\"expire\");
" || echo "WARNING: psql session-table creation skipped (server startup will handle it)"
