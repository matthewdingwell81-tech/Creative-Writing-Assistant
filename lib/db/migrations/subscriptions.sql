ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid varchar(128);
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;
