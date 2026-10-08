-- Additive only. Empty rows retain a revision to reject stale writes after
-- reset/expiry; text is removed at expiry and all rows cascade on deletion.
CREATE TABLE IF NOT EXISTS coach_history (
  document_id integer PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_history_expiry ON coach_history(updated_at)
  WHERE draft <> '' OR messages <> '[]'::jsonb;
