#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply additive migrations without reconciling unrelated session tables.
pnpm --filter @workspace/db run migrate:planning
