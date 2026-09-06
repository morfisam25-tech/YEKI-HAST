-- Blueprint v1.2 Internet Voice foundation.
-- This migration is intentionally additive: existing masked-PSTN columns stay in place
-- for backward compatibility while new domain code moves to transport-neutral fields.

DO $$
BEGIN
  CREATE TYPE app.call_transport AS ENUM ('internet_voice', 'masked_pstn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE app.call_sessions
  ADD COLUMN IF NOT EXISTS transport app.call_transport,
  ADD COLUMN IF NOT EXISTS transport_session_id varchar(255);

-- Existing provider-backed sessions are masked PSTN. Do not infer a transport for calls
-- that never reached provider dispatch.
UPDATE app.call_sessions
SET transport='masked_pstn',
    transport_session_id=COALESCE(transport_session_id, provider_bridge_id)
WHERE transport IS NULL
  AND (telephony_provider IS NOT NULL OR provider_bridge_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS call_sessions_transport_status_idx
  ON app.call_sessions(transport, status, requested_at DESC);

-- WebRTC offer/answer/ICE data is operationally transient and must not be written to
-- long-lived call_events/audit history. Rows expire quickly and are opportunistically
-- deleted by the signaling route; a scheduled cleanup can be added without changing
-- the signaling contract.
CREATE TABLE IF NOT EXISTS app.internet_voice_signals (
  id bigserial PRIMARY KEY,
  call_session_id uuid NOT NULL REFERENCES app.call_sessions(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('caller','listener')),
  signal_kind text NOT NULL CHECK (signal_kind IN ('offer','answer','ice','media_connected','reconnecting','reconnected')),
  payload jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS internet_voice_signals_call_created_idx
  ON app.internet_voice_signals(call_session_id, created_at, id);
CREATE INDEX IF NOT EXISTS internet_voice_signals_expiry_idx
  ON app.internet_voice_signals(expires_at);
