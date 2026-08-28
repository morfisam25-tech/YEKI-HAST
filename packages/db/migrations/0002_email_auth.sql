CREATE TABLE IF NOT EXISTS private_data.user_emails (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  email_ciphertext text NOT NULL,
  email_hash char(64) NOT NULL UNIQUE,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private_data.email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash char(64) NOT NULL,
  request_ip_hash char(64) NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_otp_challenges_email_lookup_idx
  ON private_data.email_otp_challenges(email_hash, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS email_otp_challenges_ip_created_idx
  ON private_data.email_otp_challenges(request_ip_hash, created_at DESC);
