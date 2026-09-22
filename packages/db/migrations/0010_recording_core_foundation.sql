-- W58 recording core foundation.
--
-- Purely additive. Reuses the dormant `app.recording_mode` enum/column on
-- app.call_sessions (added in 0001_initial: 'none' | 'all_with_consent' |
-- 'policy_exception') and the dormant `'recording'` value of `app.consent_type`
-- (also 0001_initial) exactly as they already exist. Neither is altered here.
--
-- The pre-existing `private_data.call_recordings` table is intentionally left
-- untouched and unused by this migration: it is UNIQUE on call_session_id, which
-- cannot represent multiple provider output segments for one call (reconnects,
-- late join, extensions -- see W58 task section 9). New evidence-metadata tables
-- below replace it going forward; `call_recordings` stays reachable for any
-- future migration that wants to backfill/retire it explicitly.

DO $$
BEGIN
  CREATE TYPE app.recording_state AS ENUM (
    'not_requested',
    'consent_pending',
    'ready',
    'starting',
    'recording',
    'stopping',
    'uploading',
    'stored',
    'failed',
    'held',
    'purged'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- CONSENT (per call, per participant -- distinct from the user+version-scoped
-- app.consents table, which cannot express "did this specific participant
-- consent to recording for this specific call").
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.call_recording_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id uuid NOT NULL REFERENCES app.call_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role app.call_party NOT NULL,
  consent_type app.consent_type NOT NULL DEFAULT 'recording',
  policy_version text NOT NULL,
  locale text NOT NULL,
  client_version text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (call_session_id, user_id),
  CHECK (consent_type = 'recording')
);

CREATE INDEX IF NOT EXISTS call_recording_consents_call_idx
  ON app.call_recording_consents(call_session_id);

-- ---------------------------------------------------------------------------
-- RECORDING SESSIONS (one authoritative provider-facing recording per call,
-- unless allow_multiple_recording is ever used -- not exercised in W58).
-- Server-authoritative state machine; app.recording_state above.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private_data.call_recording_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id uuid NOT NULL REFERENCES app.call_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_meeting_id text,
  provider_recording_id text,
  state app.recording_state NOT NULL DEFAULT 'not_requested',
  consent_policy_version text NOT NULL,
  failure_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  retention_until timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  legal_hold_reason_code text,
  legal_hold_case_kind text CHECK (legal_hold_case_kind IS NULL OR legal_hold_case_kind IN ('report', 'safety_event')),
  legal_hold_case_id uuid,
  legal_hold_set_by uuid REFERENCES app.users(id),
  legal_hold_set_at timestamptz,
  legal_hold_released_by uuid REFERENCES app.users(id),
  legal_hold_released_at timestamptz,
  purge_eligible_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_session_id),
  CHECK (NOT legal_hold OR legal_hold_reason_code IS NOT NULL),
  CHECK (NOT legal_hold OR (legal_hold_case_kind IS NOT NULL AND legal_hold_case_id IS NOT NULL))
);

CREATE TRIGGER call_recording_sessions_set_updated_at
BEFORE UPDATE ON private_data.call_recording_sessions
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE INDEX IF NOT EXISTS call_recording_sessions_state_idx
  ON private_data.call_recording_sessions(state);
CREATE INDEX IF NOT EXISTS call_recording_sessions_purge_idx
  ON private_data.call_recording_sessions(purge_eligible_at)
  WHERE purged_at IS NULL AND NOT legal_hold;

-- ---------------------------------------------------------------------------
-- RECORDING SEGMENTS (evidence metadata per provider output artifact). Many
-- rows per recording session: reconnects, late join, extensions, or multiple
-- provider files for one call all attach here, never to app.call_sessions
-- directly, so nothing about segment count is baked into the call schema.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS private_data.call_recording_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_session_id uuid NOT NULL REFERENCES private_data.call_recording_sessions(id) ON DELETE CASCADE,
  provider_output_id text,
  participant_identity text,
  storage_reference_ciphertext text,
  encryption_key_version text,
  state app.recording_state NOT NULL DEFAULT 'starting',
  failure_code text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  bytes bigint CHECK (bytes IS NULL OR bytes >= 0),
  checksum_sha256 char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_reference_ciphertext IS NULL OR encryption_key_version IS NOT NULL)
);

CREATE TRIGGER call_recording_segments_set_updated_at
BEFORE UPDATE ON private_data.call_recording_segments
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE INDEX IF NOT EXISTS call_recording_segments_session_idx
  ON private_data.call_recording_segments(recording_session_id, created_at);

-- ---------------------------------------------------------------------------
-- ADMIN CAPABILITIES (smallest safe capability mechanism: app.admin_users has
-- only a single free-text admin_role with no fine-grained permission today --
-- see services/api/src/lib/admin.ts requireAdmin(). Recording playback must
-- NOT be available to every admin by default, so it is gated by an explicit
-- capability grant instead of widening admin_role semantics.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.admin_capabilities (
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  granted_by uuid REFERENCES app.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, capability)
);

-- ---------------------------------------------------------------------------
-- PLAYBACK AUTHORIZATION + AUDIT. One row per short-lived playback grant a
-- safety admin requests, linked to a safety case and reason code. Every
-- playback attempt is auditable here; there is no separate download path.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.recording_playback_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES app.users(id),
  recording_session_id uuid NOT NULL REFERENCES private_data.call_recording_sessions(id),
  safety_case_kind text NOT NULL CHECK (safety_case_kind IN ('report', 'safety_event')),
  safety_case_id uuid NOT NULL,
  reason_code text NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accessed_at timestamptz,
  CHECK (expires_at > authorized_at)
);

CREATE INDEX IF NOT EXISTS recording_playback_grants_session_idx
  ON app.recording_playback_grants(recording_session_id, authorized_at DESC);
CREATE INDEX IF NOT EXISTS recording_playback_grants_admin_idx
  ON app.recording_playback_grants(admin_user_id, authorized_at DESC);
