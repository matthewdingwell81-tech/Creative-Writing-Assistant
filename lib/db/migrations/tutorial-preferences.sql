ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tutorials_enabled boolean NOT NULL DEFAULT true;
