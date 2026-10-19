-- Store only interactions identified by the safety classifier.
CREATE TABLE IF NOT EXISTS safety_flags (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature varchar(32) NOT NULL,
  phases jsonb NOT NULL,
  request_context text,
  generated_content text,
  status varchar(32) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  reviewer_note text
);

CREATE INDEX IF NOT EXISTS safety_flags_status_created_at
  ON safety_flags(status, created_at DESC);
