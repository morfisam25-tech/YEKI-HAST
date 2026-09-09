-- Wave 1 global Caller market resolution + post-call feedback persistence.
-- Caller billing market is explicit and persisted. Listener matching remains in the shared
-- Persian marketplace operating context, while Listener base payout remains local and does
-- not change with Caller country.

ALTER TABLE app.caller_profiles
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES app.markets(id);

-- Preserve the existing Iran cohort without guessing geography for new users. Existing Caller
-- profiles were created while Iran was the only configured Caller market; new profiles remain
-- unset until the Caller explicitly selects a validated market.
UPDATE app.caller_profiles cp
SET market_id=m.id
FROM app.markets m
WHERE cp.market_id IS NULL
  AND m.code='ir';

CREATE INDEX IF NOT EXISTS caller_profiles_market_idx
  ON app.caller_profiles(market_id)
  WHERE market_id IS NOT NULL;

ALTER TABLE app.call_reservations
  ADD COLUMN IF NOT EXISTS caller_market_id uuid REFERENCES app.markets(id);

UPDATE app.call_reservations
SET caller_market_id=market_id
WHERE caller_market_id IS NULL;

ALTER TABLE app.call_reservations
  ALTER COLUMN caller_market_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS call_reservations_caller_market_idx
  ON app.call_reservations(caller_user_id, caller_market_id, status, scheduled_at);

ALTER TABLE app.call_sessions
  ADD COLUMN IF NOT EXISTS caller_market_id uuid REFERENCES app.markets(id),
  ADD COLUMN IF NOT EXISTS listener_currency_code varchar(3);

UPDATE app.call_sessions
SET caller_market_id=COALESCE(caller_market_id,market_id),
    listener_currency_code=COALESCE(listener_currency_code,currency_code)
WHERE caller_market_id IS NULL OR listener_currency_code IS NULL;

ALTER TABLE app.call_sessions
  ALTER COLUMN caller_market_id SET NOT NULL,
  ALTER COLUMN listener_currency_code SET NOT NULL,
  ALTER COLUMN platform_contribution_minor DROP NOT NULL;

ALTER TABLE app.call_sessions
  DROP CONSTRAINT IF EXISTS call_sessions_listener_currency_code_check;
ALTER TABLE app.call_sessions
  ADD CONSTRAINT call_sessions_listener_currency_code_check
  CHECK (listener_currency_code ~ '^[A-Z]{3}$');

CREATE INDEX IF NOT EXISTS call_sessions_caller_market_idx
  ON app.call_sessions(caller_user_id, caller_market_id, requested_at DESC);

-- The original schema binds Listener earnings to the Call's Caller-charge currency. That is
-- correct while both sides use IRR, but would reject a foreign Caller whose Listener still
-- earns the shared marketplace base payout in IRR. Preserve participant identity while binding
-- the earning currency to the explicit Listener payout-currency snapshot instead.
CREATE UNIQUE INDEX IF NOT EXISTS call_sessions_id_listener_listener_currency_uidx
  ON app.call_sessions(id, listener_user_id, listener_currency_code);

ALTER TABLE app.listener_earnings
  DROP CONSTRAINT IF EXISTS listener_earnings_call_session_id_listener_user_id_currenc_fkey;
ALTER TABLE app.listener_earnings
  DROP CONSTRAINT IF EXISTS listener_earnings_call_listener_payout_currency_fkey;
ALTER TABLE app.listener_earnings
  ADD CONSTRAINT listener_earnings_call_listener_payout_currency_fkey
  FOREIGN KEY (call_session_id, listener_user_id, currency_code)
  REFERENCES app.call_sessions(id, listener_user_id, listener_currency_code);

CREATE TABLE IF NOT EXISTS app.call_ratings (
  call_session_id uuid PRIMARY KEY REFERENCES app.call_sessions(id) ON DELETE CASCADE,
  caller_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  listener_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES app.service_catalog(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (caller_user_id <> listener_user_id)
);

CREATE INDEX IF NOT EXISTS call_ratings_listener_service_idx
  ON app.call_ratings(listener_user_id, service_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.caller_favorite_listeners (
  caller_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  listener_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caller_user_id, listener_user_id),
  CHECK (caller_user_id <> listener_user_id)
);

CREATE INDEX IF NOT EXISTS caller_favorite_listeners_listener_idx
  ON app.caller_favorite_listeners(listener_user_id, created_at DESC);

-- Replace the server sweeper settlement function so a foreign Caller wallet can be charged in
-- its configured pricebook currency while a Wave 1 Iran Listener still earns the local base
-- payout in IRR. Cross-currency platform contribution is deliberately NULL until an approved
-- FX/accounting conversion exists; no exchange rate is invented here.
CREATE OR REPLACE FUNCTION app.settle_internet_voice_call(
  p_call_id uuid,
  p_ended_reason text,
  p_ended_by_role text,
  p_safety boolean DEFAULT false,
  p_effective_end_at timestamptz DEFAULT NULL
)
RETURNS TABLE(
  final_status text,
  billable_seconds integer,
  caller_charge_minor bigint,
  listener_earning_minor bigint,
  idempotent boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_call record;
  v_increment integer;
  v_observed_end_at timestamptz;
  v_connected_seconds integer;
  v_billable_seconds integer;
  v_charge bigint;
  v_earning bigint;
  v_authorized bigint;
  v_unused_hold bigint;
  v_wallet record;
  v_balance_after bigint;
  v_status app.call_status;
  v_reason text;
  v_same_currency boolean;
BEGIN
  IF p_ended_by_role NOT IN ('caller','listener','system') THEN
    RAISE EXCEPTION 'invalid_ended_by_role';
  END IF;

  SELECT cs.* INTO v_call
  FROM app.call_sessions cs
  WHERE cs.id=p_call_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'call_not_found'; END IF;
  IF v_call.transport::text <> 'internet_voice' THEN RAISE EXCEPTION 'call_not_internet_voice'; END IF;

  IF v_call.status::text IN ('completed','safety_terminated') THEN
    RETURN QUERY SELECT
      v_call.status::text,
      v_call.billable_seconds,
      v_call.caller_charge_minor,
      v_call.listener_earning_minor,
      true;
    RETURN;
  END IF;
  IF v_call.status::text <> 'connected' THEN RAISE EXCEPTION 'call_not_settleable'; END IF;
  IF v_call.connected_at IS NULL THEN RAISE EXCEPTION 'call_missing_connected_at'; END IF;
  IF v_call.listener_user_id IS NULL
     OR v_call.pricing_plan_id IS NULL
     OR v_call.max_billable_seconds IS NULL
     OR v_call.listener_currency_code IS NULL THEN
    RAISE EXCEPTION 'call_missing_settlement_context';
  END IF;

  SELECT pp.billing_increment_seconds INTO v_increment
  FROM app.pricing_plans pp
  WHERE pp.id=v_call.pricing_plan_id;
  IF v_increment IS NULL OR v_increment < 1 OR v_increment > 60 THEN
    RAISE EXCEPTION 'pricing_plan_unavailable';
  END IF;

  v_observed_end_at := LEAST(now(),COALESCE(p_effective_end_at,now()));
  IF v_observed_end_at < v_call.connected_at THEN
    v_observed_end_at := v_call.connected_at;
  END IF;
  v_connected_seconds := LEAST(
    v_call.max_billable_seconds,
    GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (v_observed_end_at-v_call.connected_at)))::integer)
  );
  IF v_connected_seconds=0 THEN
    v_billable_seconds := 0;
  ELSE
    v_billable_seconds := ((v_connected_seconds + v_increment - 1) / v_increment) * v_increment;
  END IF;
  v_billable_seconds := LEAST(v_billable_seconds, v_call.max_billable_seconds);

  v_charge := (v_call.caller_rate_per_minute_minor * v_billable_seconds + 59) / 60;
  v_earning := (v_call.listener_rate_per_minute_minor * v_billable_seconds) / 60;
  v_authorized := v_call.authorized_minor;
  v_same_currency := v_call.currency_code=v_call.listener_currency_code;

  IF v_charge > v_authorized THEN RAISE EXCEPTION 'settlement_exceeds_authorization'; END IF;
  IF v_same_currency AND v_earning > v_charge THEN RAISE EXCEPTION 'negative_platform_spread'; END IF;

  SELECT w.id, w.balance_minor, w.reserved_minor INTO v_wallet
  FROM app.wallets w
  WHERE w.user_id=v_call.caller_user_id
    AND w.currency_code=v_call.currency_code
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_unavailable'; END IF;
  IF v_wallet.reserved_minor < v_authorized THEN RAISE EXCEPTION 'wallet_reservation_missing'; END IF;
  IF v_wallet.balance_minor < v_charge THEN RAISE EXCEPTION 'wallet_balance_conflict'; END IF;

  UPDATE app.wallets
  SET balance_minor=balance_minor-v_charge,
      reserved_minor=reserved_minor-v_authorized,
      version=version+1,
      updated_at=now()
  WHERE id=v_wallet.id
    AND balance_minor >= v_charge
    AND reserved_minor >= v_authorized
  RETURNING balance_minor INTO v_balance_after;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_settlement_conflict'; END IF;

  IF v_charge > 0 THEN
    INSERT INTO app.wallet_transactions(
      wallet_id,currency_code,type,delta_minor,balance_after_minor,
      call_session_id,reason_code,idempotency_key
    ) VALUES (
      v_wallet.id,v_call.currency_code,'call_charge',-v_charge,v_balance_after,
      p_call_id,'call_completed','call:' || p_call_id::text || ':charge'
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO app.wallet_hold_events(
      wallet_id,call_session_id,currency_code,event_type,amount_minor,
      reason_code,idempotency_key,metadata
    ) VALUES (
      v_wallet.id,p_call_id,v_call.currency_code,'consume',v_charge,
      'actual_connected_time_charge','call:' || p_call_id::text || ':hold:consume',
      jsonb_build_object('billableSeconds',v_billable_seconds)
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  v_unused_hold := v_authorized-v_charge;
  IF v_unused_hold > 0 THEN
    INSERT INTO app.wallet_hold_events(
      wallet_id,call_session_id,currency_code,event_type,amount_minor,
      reason_code,idempotency_key,metadata
    ) VALUES (
      v_wallet.id,p_call_id,v_call.currency_code,'release',v_unused_hold,
      'unused_session_hold','call:' || p_call_id::text || ':hold:release:unused',
      jsonb_build_object(
        'authorizedMinor',v_authorized::text,
        'callerChargeMinor',v_charge::text
      )
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  IF v_earning > 0 THEN
    INSERT INTO app.listener_earnings(
      listener_user_id,call_session_id,market_id,currency_code,amount_minor,status
    ) VALUES (
      v_call.listener_user_id,p_call_id,v_call.market_id,
      v_call.listener_currency_code,v_earning,'pending'
    ) ON CONFLICT (call_session_id) DO NOTHING;
  END IF;

  v_status := CASE
    WHEN p_safety THEN 'safety_terminated'::app.call_status
    ELSE 'completed'::app.call_status
  END;
  v_reason := LEFT(
    COALESCE(
      NULLIF(BTRIM(p_ended_reason),''),
      CASE
        WHEN p_safety THEN 'internet_voice_safety_exit'
        ELSE 'internet_voice_completed'
      END
    ),
    120
  );

  UPDATE app.call_sessions
  SET status=v_status,
      ended_at=COALESCE(ended_at,now()),
      ended_reason=v_reason,
      billable_seconds=v_billable_seconds,
      caller_charge_minor=v_charge,
      listener_earning_minor=v_earning,
      platform_contribution_minor=CASE
        WHEN v_same_currency THEN
          v_charge-v_earning-telephony_cost_minor-payment_cost_minor-other_variable_cost_minor
        ELSE NULL
      END,
      updated_at=now()
  WHERE id=p_call_id
    AND status='connected'
    AND transport='internet_voice';
  IF NOT FOUND THEN RAISE EXCEPTION 'call_settlement_conflict'; END IF;

  INSERT INTO app.call_events(call_session_id,status,source,metadata)
  VALUES (
    p_call_id,
    v_status,
    CASE WHEN p_ended_by_role='system' THEN 'system' ELSE 'api' END,
    jsonb_build_object(
      'reason',v_reason,
      'transport','internet_voice',
      'endedByRole',p_ended_by_role,
      'effectiveEndAt',v_observed_end_at,
      'connectedSecondsObserved',v_connected_seconds,
      'billableSeconds',v_billable_seconds,
      'callerChargeMinor',v_charge::text,
      'callerCurrencyCode',v_call.currency_code,
      'listenerEarningMinor',v_earning::text,
      'listenerCurrencyCode',v_call.listener_currency_code,
      'holdReleasedMinor',v_unused_hold::text,
      'platformContributionPendingFx',NOT v_same_currency
    )
  );

  DELETE FROM app.internet_voice_signals WHERE call_session_id=p_call_id;

  RETURN QUERY SELECT
    v_status::text,v_billable_seconds,v_charge,v_earning,false;
END;
$$;
