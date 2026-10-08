-- Applied idempotently by the API server before it accepts requests.
-- Existing accounts receive the rollout timestamp and therefore a fresh
-- seven-day welcome trial.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now();
