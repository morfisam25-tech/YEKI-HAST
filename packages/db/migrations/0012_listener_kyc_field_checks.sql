-- W78 field-level KYC check evidence.
--
-- private_data.listener_kyc.status is a single coarse verdict for the whole
-- KYC record. It has no way to represent "which specific field was actually
-- checked, against which provider, with what result" -- the exact gap that
-- lets a UI or API overclaim a generic "identity verified" from one passing
-- check. This table is purely additive (no ALTER of listener_kyc or any
-- existing table) and exists to make each check's evidence auditable on its
-- own: what was requested, which provider, when, the result, and the
-- provider's own correlation reference (never the raw sensitive payload).

CREATE TYPE app.kyc_check_kind AS ENUM (
  'national_id_dob_match',
  'iban_inquiry'
);

CREATE TYPE app.kyc_check_status AS ENUM (
  'not_checked',
  'pending',
  'verified',
  'failed',
  'error'
);

CREATE TABLE private_data.listener_kyc_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES private_data.listener_kyc(user_id) ON DELETE CASCADE,
  check_kind app.kyc_check_kind NOT NULL,
  status app.kyc_check_status NOT NULL DEFAULT 'not_checked',
  provider text,
  -- Provider-issued correlation id only (e.g. an inquiry id) -- never the
  -- raw provider response payload, which may contain identity fields.
  provider_reference text,
  failure_code text,
  requested_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, check_kind)
);

CREATE TRIGGER listener_kyc_checks_set_updated_at
BEFORE UPDATE ON private_data.listener_kyc_checks
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE INDEX listener_kyc_checks_user_id_idx ON private_data.listener_kyc_checks(user_id);
