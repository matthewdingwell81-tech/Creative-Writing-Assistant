#!/bin/bash
set -e

# Install any newly added or updated dependencies.
npm install --no-audit --no-fund

# Apply any new Drizzle schema changes to the database.
# `--force` makes this non-interactive (no destructive prompts).
npm run db:push -- --force
