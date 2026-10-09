#!/bin/bash
set -euo pipefail

step="dependency installation"
trap 'status=$?; printf "Post-merge setup failed during %s (exit %s).\n" "$step" "$status" >&2; exit "$status"' ERR

echo "Post-merge: $step"
pnpm install --frozen-lockfile

step="API client/schema generation and library type checking"
echo "Post-merge: $step"
pnpm --filter @workspace/api-spec run codegen

# Validate consumers too: library checks alone do not catch missing Lumina exports.
step="workspace type checking"
echo "Post-merge: $step"
pnpm run typecheck

# Apply additive migrations without reconciling unrelated session tables.
step="planning migration"
echo "Post-merge: $step"
pnpm --filter @workspace/db run migrate:planning
step="Coach migration"
echo "Post-merge: $step"
pnpm --filter @workspace/db run migrate:coach

echo "Post-merge setup completed."
