-- Keep the route-side Wallet release and the status-transition ledger trigger on one
-- deterministic idempotency key. This prevents duplicate economic release events while
-- retaining the trigger as the append-only audit backstop.
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