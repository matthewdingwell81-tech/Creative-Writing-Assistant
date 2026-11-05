CREATE TABLE IF NOT EXISTS billing_email_deliveries (
  account_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_key text NOT NULL,
  recipient_email text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  provider_email_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT billing_email_deliveries_status_check CHECK (status IN ('sending', 'pending', 'sent')),
  PRIMARY KEY (account_id, access_key)
);
