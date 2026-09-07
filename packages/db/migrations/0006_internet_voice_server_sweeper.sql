-- Blueprint v1.2 server-owned Internet Voice expiry and cap enforcement.
-- The Neon compute must set cron.database_name to the application database before
-- this migration runs. The scheduler is created only while an Internet Voice call
-- is active so an idle project can still scale to zero.

DO $$
BEGIN
  IF current_setting('cron.database_name', true) IS DISTINCT FROM current_database() THEN
    RAISE EXCEPTION 'internet_voice_pg_cron_database_not_configured'
      USING HINT = 'Set the Neon compute setting cron.database_name to ' || current_database()
        || ' and restart the compute before applying migration 0006.';
  END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE app.call_sessions
  ADD COLUMN IF NOT EXISTS voice_offer_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS voice_listener_answered_at timestamptz;

UPDATE app.call_sessions cs
SET voice_offer_started_at = COALESCE(
      cs.voice_offer_started_at,
      (
        SELECT max(ce.created_at)
        FROM app.call_events ce
        WHERE ce.call_session_id=cs.id
          AND ce.metadata->>'reason'='internet_voice_offer_started'
      ),
      cs.updated_at
    )
WHERE cs.transport='internet_voice'
  AND cs.status='calling_listener'
  AND cs.voice_offer_started_at IS NULL;

CREATE INDEX IF NOT EXISTS call_sessions_internet_voice_sweep_idx
  ON app.call_sessions(status, voice_offer_started_at, voice_listener_answered_at, connected_at)
  WHERE transport='internet_voice'
    AND status IN ('calling_listener','connected');

CREATE OR REPLACE FUNCTION app.expire_internet_voice_preconnect(
  p_call_id uuid,
  p_reason text
)
RETURNS TABLE(
  final_status text,
  idempotent boolean,
  hold_released_minor bigint,
  listener_auto_offline boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_call record;
  v_wallet_id uuid;
  v_work_session_id uuid;
  v_status app.call_status;
  v_auto_offline boolean;
  v_hold_reason text;
  v_hold_key text;
BEGIN
  IF p_reason NOT IN ('internet_voice_no_answer','internet_voice_connect_timeout') THEN
    RAISE EXCEPTION 'invalid_internet_voice_preconnect_reason';
  END IF;

  SELECT cs.* INTO v_call
  FROM app.call_sessions cs
  WHERE cs.id=p_call_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'call_not_found'; END IF;
  IF v_call.transport::text <> 'internet_voice' THEN RAISE EXCEPTION 'call_not_internet_voice'; END IF;

  IF v_call.status::text IN ('missed','failed','cancelled','completed','safety_terminated') THEN
    RETURN QUERY SELECT v_call.status::text, true, 0::bigint, false;
    RETURN;
  END IF;
  IF v_call.status::text <> 'calling_listener' THEN
    RAISE EXCEPTION 'call_not_waiting_for_listener';
  END IF;

  IF p_reason='internet_voice_no_answer' THEN
    IF v_call.voice_listener_answered_at IS NOT NULL THEN
      RAISE EXCEPTION 'listener_already_answered';
    END IF;
    IF v_call.voice_offer_started_at IS NULL
       OR now() < v_call.voice_offer_started_at + interval '90 seconds' THEN
      RAISE EXCEPTION 'no_answer_window_active';
    END IF;
    v_status := 'missed'::app.call_status;
    v_auto_offline := true;
    v_hold_reason := 'internet_voice_no_answer';
    v_hold_key := 'call:' || p_call_id::text || ':hold:release:no_answer';
  ELSE
    IF v_call.voice_listener_answered_at IS NULL THEN
      RAISE EXCEPTION 'listener_not_answered';
    END IF;
    IF now() < v_call.voice_listener_answered_at + interval '120 seconds' THEN
      RAISE EXCEPTION 'connect_timeout_window_active';
    END IF;
    v_status := 'failed'::app.call_status;
    v_auto_offline := false;
    v_hold_reason := 'internet_voice_connect_timeout';
    v_hold_key := 'call:' || p_call_id::text || ':hold:release:connect_timeout';
  END IF;

  SELECT w.id INTO v_wallet_id
  FROM app.wallets w
  WHERE w.user_id=v_call.caller_user_id
    AND w.currency_code=v_call.currency_code
  FOR UPDATE;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'wallet_unavailable'; END IF;

  IF v_call.authorized_minor > 0 THEN
    UPDATE app.wallets
    SET reserved_minor=reserved_minor-v_call.authorized_minor,
        version=version+1,
        updated_at=now()
    WHERE id=v_wallet_id
      AND reserved_minor >= v_call.authorized_minor;
    IF NOT FOUND THEN RAISE EXCEPTION 'wallet_release_conflict'; END IF;

    INSERT INTO app.wallet_hold_events(
      wallet_id, call_session_id, currency_code, event_type,
      amount_minor, reason_code, idempotency_key, metadata
    ) VALUES (
      v_wallet_id, p_call_id, v_call.currency_code, 'release',
      v_call.authorized_minor, v_hold_reason, v_hold_key,
      jsonb_build_object('chargedMinor',0,'terminalStatus',v_status::text)
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  IF v_auto_offline AND v_call.listener_user_id IS NOT NULL THEN
    SELECT lp.current_work_session_id INTO v_work_session_id
    FROM app.listener_presence lp
    WHERE lp.listener_user_id=v_call.listener_user_id
      AND lp.product_id=v_call.product_id
      AND lp.service_id=v_call.service_id
      AND lp.market_id=v_call.market_id
    FOR UPDATE;

    IF v_work_session_id IS NOT NULL THEN
      UPDATE app.listener_work_sessions
      SET ended_at=COALESCE(ended_at,now()),
          ended_reason=COALESCE(ended_reason,'instant_no_answer')
      WHERE id=v_work_session_id;
    END IF;

    UPDATE app.listener_presence
    SET status='offline',
        current_work_session_id=NULL,
        online_since=NULL,
        auto_offline_reason='instant_no_answer',
        updated_at=now()
    WHERE listener_user_id=v_call.listener_user_id
      AND product_id=v_call.product_id
      AND service_id=v_call.service_id
      AND market_id=v_call.market_id;
  END IF;

  UPDATE app.call_sessions
  SET status=v_status,
      ended_at=COALESCE(ended_at,now()),
      ended_reason=p_reason,
      updated_at=now()
  WHERE id=p_call_id
    AND status='calling_listener'
    AND transport='internet_voice';
  IF NOT FOUND THEN RAISE EXCEPTION 'call_preconnect_finalize_conflict'; END IF;

  INSERT INTO app.call_events(call_session_id,status,source,metadata)
  VALUES (
    p_call_id,
    v_status,
    'system',
    jsonb_build_object(
      'reason',p_reason,
      'transport','internet_voice',
      'holdReleased',true,
      'holdReleasedMinor',v_call.authorized_minor::text,
      'chargedMinor','0',
      'listenerAutoOffline',v_auto_offline,
      'enforcedBy','server_sweeper'
    )
  );

  DELETE FROM app.internet_voice_signals WHERE call_session_id=p_call_id;

  RETURN QUERY SELECT v_status::text, false, v_call.authorized_minor, v_auto_offline;
END;
$$;

CREATE OR REPLACE FUNCTION app.settle_internet_voice_call(
  p_call_id uuid,
  p_ended_reason text,
  p_ended_by_role text,
  p_safety boolean DEFAULT false
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
     OR v_call.max_billable_seconds IS NULL THEN
    RAISE EXCEPTION 'call_missing_settlement_context';
  END IF;

  SELECT pp.billing_increment_seconds INTO v_increment
  FROM app.pricing_plans pp
  WHERE pp.id=v_call.pricing_plan_id;
  IF v_increment IS NULL OR v_increment < 1 OR v_increment > 60 THEN
    RAISE EXCEPTION 'pricing_plan_unavailable';
  END IF;

  v_connected_seconds := LEAST(
    v_call.max_billable_seconds,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-v_call.connected_at)))::integer)
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

  IF v_charge > v_authorized THEN RAISE EXCEPTION 'settlement_exceeds_authorization'; END IF;
  IF v_earning > v_charge THEN RAISE EXCEPTION 'negative_platform_spread'; END IF;

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
      v_call.listener_user_id,p_call_id,v_call.market_id,v_call.currency_code,v_earning,'pending'
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
      platform_contribution_minor=
        v_charge-v_earning-telephony_cost_minor-payment_cost_minor-other_variable_cost_minor,
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
      'connectedSecondsObserved',v_connected_seconds,
      'billableSeconds',v_billable_seconds,
      'callerChargeMinor',v_charge::text,
      'listenerEarningMinor',v_earning::text,
      'holdReleasedMinor',v_unused_hold::text
    )
  );

  DELETE FROM app.internet_voice_signals WHERE call_session_id=p_call_id;

  RETURN QUERY SELECT
    v_status::text,v_billable_seconds,v_charge,v_earning,false;
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_internet_voice_sweeper_job()
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id bigint;
  v_schedule text;
  v_command text;
BEGIN
  PERFORM pg_advisory_xact_lock(742019912);

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    RAISE EXCEPTION 'internet_voice_pg_cron_not_installed';
  END IF;

  SELECT jobid,schedule,command
  INTO v_job_id,v_schedule,v_command
  FROM cron.job
  WHERE jobname='yeki_hast_internet_voice_sweep'
  ORDER BY jobid
  LIMIT 1;

  IF v_job_id IS NOT NULL
     AND (
       v_schedule <> '10 seconds'
       OR v_command <> 'SELECT * FROM app.sweep_internet_voice_sessions(100);'
     ) THEN
    PERFORM cron.unschedule(v_job_id);
    v_job_id := NULL;
  END IF;

  IF v_job_id IS NULL THEN
    SELECT cron.schedule(
      'yeki_hast_internet_voice_sweep',
      '10 seconds',
      'SELECT * FROM app.sweep_internet_voice_sessions(100);'
    ) INTO v_job_id;
  END IF;

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.stop_internet_voice_sweeper_if_idle()
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id bigint;
  v_stopped boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(742019912);

  IF EXISTS (
    SELECT 1
    FROM app.call_sessions
    WHERE transport='internet_voice'
      AND status IN ('calling_listener','connected')
  ) THEN
    RETURN false;
  END IF;

  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname='yeki_hast_internet_voice_sweep'
  LOOP
    PERFORM cron.unschedule(v_job_id);
    v_stopped := true;
  END LOOP;

  RETURN v_stopped;
END;
$$;

CREATE OR REPLACE FUNCTION app.sweep_internet_voice_sessions(
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  no_answer_expired integer,
  connect_timeout_expired integer,
  cap_settled integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_call record;
  v_no_answer integer := 0;
  v_connect_timeout integer := 0;
  v_cap integer := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid_sweep_limit';
  END IF;

  DELETE FROM app.internet_voice_signals WHERE expires_at<=now();

  FOR v_call IN
    SELECT id
    FROM app.call_sessions
    WHERE transport='internet_voice'
      AND status='calling_listener'
      AND voice_listener_answered_at IS NULL
      AND voice_offer_started_at IS NOT NULL
      AND voice_offer_started_at <= now()-interval '90 seconds'
    ORDER BY voice_offer_started_at,id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    PERFORM 1
    FROM app.expire_internet_voice_preconnect(
      v_call.id,
      'internet_voice_no_answer'
    );
    v_no_answer := v_no_answer+1;
  END LOOP;

  FOR v_call IN
    SELECT id
    FROM app.call_sessions
    WHERE transport='internet_voice'
      AND status='calling_listener'
      AND voice_listener_answered_at IS NOT NULL
      AND voice_listener_answered_at <= now()-interval '120 seconds'
    ORDER BY voice_listener_answered_at,id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    PERFORM 1
    FROM app.expire_internet_voice_preconnect(
      v_call.id,
      'internet_voice_connect_timeout'
    );
    v_connect_timeout := v_connect_timeout+1;
  END LOOP;

  FOR v_call IN
    SELECT id
    FROM app.call_sessions
    WHERE transport='internet_voice'
      AND status='connected'
      AND connected_at IS NOT NULL
      AND max_billable_seconds IS NOT NULL
      AND connected_at + make_interval(secs=>max_billable_seconds) <= now()
    ORDER BY connected_at,id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    PERFORM 1
    FROM app.settle_internet_voice_call(
      v_call.id,
      'internet_voice_session_cap_reached',
      'system',
      false
    );
    v_cap := v_cap+1;
  END LOOP;

  PERFORM app.stop_internet_voice_sweeper_if_idle();

  RETURN QUERY SELECT v_no_answer,v_connect_timeout,v_cap;
END;
$$;

CREATE OR REPLACE FUNCTION app.manage_internet_voice_sweeper_on_call_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transport='internet_voice'
     AND NEW.status IN ('calling_listener','connected') THEN
    PERFORM app.ensure_internet_voice_sweeper_job();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_sessions_internet_voice_sweeper_job
  ON app.call_sessions;

CREATE TRIGGER call_sessions_internet_voice_sweeper_job
AFTER UPDATE OF status, transport ON app.call_sessions
FOR EACH ROW
EXECUTE FUNCTION app.manage_internet_voice_sweeper_on_call_change();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app.call_sessions
    WHERE transport='internet_voice'
      AND status IN ('calling_listener','connected')
  ) THEN
    PERFORM app.ensure_internet_voice_sweeper_job();
  ELSE
    PERFORM app.stop_internet_voice_sweeper_if_idle();
  END IF;
END;
$$;
