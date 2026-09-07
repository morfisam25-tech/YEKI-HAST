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

-- Closed-loop wallet HOLD ledger. This does not replace wallet_transactions, which remains
-- the balance ledger. HOLD events explain why reserved_minor changed without pretending a
-- reservation is already a charge.
CREATE TABLE IF NOT EXISTS app.wallet_hold_events (
  id bigserial PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES app.wallets(id),
  call_session_id uuid NOT NULL REFERENCES app.call_sessions(id) ON DELETE CASCADE,
  currency_code char(3) NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('reserve','extend','release','consume')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  reason_code text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_hold_events_call_idx
  ON app.wallet_hold_events(call_session_id, created_at, id);
CREATE INDEX IF NOT EXISTS wallet_hold_events_wallet_idx
  ON app.wallet_hold_events(wallet_id, created_at DESC);

-- Every new call authorization gets an append-only initial HOLD record in the same DB
-- transaction as call creation. A later wallet reservation conflict rolls the event back too.
CREATE OR REPLACE FUNCTION app.record_initial_call_hold()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  IF NEW.authorized_minor <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_wallet_id
  FROM app.wallets
  WHERE user_id=NEW.caller_user_id AND currency_code=NEW.currency_code
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'wallet_missing_for_call_hold';
  END IF;

  INSERT INTO app.wallet_hold_events(
    wallet_id, call_session_id, currency_code, event_type,
    amount_minor, reason_code, idempotency_key, metadata
  ) VALUES (
    v_wallet_id, NEW.id, NEW.currency_code, 'reserve',
    NEW.authorized_minor, 'session_cap_hold', 'call:' || NEW.id::text || ':hold:initial',
    jsonb_build_object('maxBillableSeconds', NEW.max_billable_seconds)
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_sessions_initial_hold_ledger ON app.call_sessions;
CREATE TRIGGER call_sessions_initial_hold_ledger
AFTER INSERT ON app.call_sessions
FOR EACH ROW EXECUTE FUNCTION app.record_initial_call_hold();

-- Internet Voice no-answer is a zero-charge terminal path. The route releases reserved_minor
-- before marking the call missed; this trigger records that same release in the append-only
-- HOLD ledger inside the transaction. Restrict it to the explicit no-answer reason so a future
-- generic missed-call transition cannot claim money was released when it was not.
CREATE OR REPLACE FUNCTION app.record_internet_voice_no_answer_hold_release()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  IF NEW.status::text <> 'missed'
     OR OLD.status::text = 'missed'
     OR NEW.transport::text <> 'internet_voice'
     OR NEW.ended_reason IS DISTINCT FROM 'internet_voice_no_answer'
     OR NEW.authorized_minor <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_wallet_id
  FROM app.wallets
  WHERE user_id=NEW.caller_user_id AND currency_code=NEW.currency_code
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'wallet_missing_for_no_answer_hold_release';
  END IF;

  INSERT INTO app.wallet_hold_events(
    wallet_id, call_session_id, currency_code, event_type,
    amount_minor, reason_code, idempotency_key, metadata
  ) VALUES (
    v_wallet_id, NEW.id, NEW.currency_code, 'release',
    NEW.authorized_minor, 'internet_voice_no_answer',
    'call:' || NEW.id::text || ':hold:release:no_answer',
    jsonb_build_object('chargedMinor', 0, 'terminalStatus', 'missed')
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_sessions_no_answer_hold_release_ledger ON app.call_sessions;
CREATE TRIGGER call_sessions_no_answer_hold_release_ledger
AFTER UPDATE OF status ON app.call_sessions
FOR EACH ROW EXECUTE FUNCTION app.record_internet_voice_no_answer_hold_release();

-- Wave 1 has exactly 10/30/60 minute initial choices. Extensions are UPDATEs after the call
-- connects and therefore are intentionally outside this INSERT-only guard.
CREATE OR REPLACE FUNCTION app.enforce_wave1_initial_session_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_code text;
  v_service_code text;
BEGIN
  SELECT p.code, s.code INTO v_product_code, v_service_code
  FROM app.products p, app.service_catalog s
  WHERE p.id=NEW.product_id AND s.id=NEW.service_id;

  IF v_product_code='yeki_hast' AND v_service_code='human_listening' THEN
    IF NEW.max_billable_seconds IS NULL OR NEW.max_billable_seconds NOT IN (600, 1800, 3600) THEN
      RAISE EXCEPTION 'invalid_wave1_session_cap';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_sessions_wave1_cap_guard ON app.call_sessions;
CREATE TRIGGER call_sessions_wave1_cap_guard
BEFORE INSERT ON app.call_sessions
FOR EACH ROW EXECUTE FUNCTION app.enforce_wave1_initial_session_cap();

-- v1.2 Iran economics are expressed to users in toman, while the ledger remains in IRR
-- minor units. 4,000 / 2,800 / 1,200 toman therefore becomes 40,000 / 28,000 / 12,000 IRR.
-- Existing call sessions keep their snapshotted rates; this changes future authorizations only.
UPDATE app.pricing_plans pp
SET caller_rate_per_minute_minor=40000,
    listener_rate_per_minute_minor=28000,
    billing_increment_seconds=1
FROM app.products p, app.service_catalog s, app.markets m
WHERE pp.product_id=p.id
  AND pp.service_id=s.id
  AND pp.market_id=m.id
  AND p.code='yeki_hast'
  AND s.code='human_listening'
  AND m.code='ir'
  AND pp.currency_code='IRR'
  AND pp.is_active=true;
