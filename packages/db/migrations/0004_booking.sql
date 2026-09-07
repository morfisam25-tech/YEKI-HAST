-- Blueprint v1.2 Booking foundation.
-- Availability and reservations are transport-neutral. Wallet HOLD is intentionally created
-- only when a due reservation starts a CallSession, not when the future slot is booked.

CREATE TABLE IF NOT EXISTS app.listener_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES app.products(id),
  service_id uuid NOT NULL REFERENCES app.service_catalog(id),
  market_id uuid NOT NULL REFERENCES app.markets(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','cancelled')),
  accepts_male boolean NOT NULL DEFAULT true,
  accepts_female boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (ends_at > starts_at),
  CHECK (accepts_male OR accepts_female)
);

CREATE INDEX IF NOT EXISTS listener_availability_listener_time_idx
  ON app.listener_availability(listener_user_id, product_id, service_id, market_id, starts_at, ends_at)
  WHERE status='open';
CREATE INDEX IF NOT EXISTS listener_availability_market_time_idx
  ON app.listener_availability(product_id, service_id, market_id, starts_at)
  WHERE status='open';

CREATE TABLE IF NOT EXISTS app.call_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES app.products(id),
  service_id uuid NOT NULL REFERENCES app.service_catalog(id),
  market_id uuid NOT NULL REFERENCES app.markets(id),
  availability_id uuid NOT NULL REFERENCES app.listener_availability(id),
  caller_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  listener_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  language_id uuid NOT NULL REFERENCES app.languages(id),
  client_request_id varchar(100) NOT NULL,
  scheduled_at timestamptz NOT NULL,
  max_billable_seconds integer NOT NULL CHECK (max_billable_seconds IN (600,1800,3600)),
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','initiated','missed')),
  call_session_id uuid UNIQUE REFERENCES app.call_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  initiated_at timestamptz,
  CHECK (caller_user_id <> listener_user_id),
  UNIQUE (caller_user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS call_reservations_listener_time_idx
  ON app.call_reservations(listener_user_id, scheduled_at)
  WHERE status IN ('booked','initiated');
CREATE INDEX IF NOT EXISTS call_reservations_caller_time_idx
  ON app.call_reservations(caller_user_id, scheduled_at)
  WHERE status IN ('booked','initiated');
CREATE INDEX IF NOT EXISTS call_reservations_availability_idx
  ON app.call_reservations(availability_id, status, scheduled_at);

-- Expired, never-started reservations become explicit no-shows when a booking endpoint sweeps
-- them. This function keeps that transition identical for Caller and Listener reads.
CREATE OR REPLACE FUNCTION app.expire_due_call_reservations()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE app.call_reservations
  SET status='missed', updated_at=now()
  WHERE status='booked'
    AND scheduled_at + make_interval(secs => max_billable_seconds) <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
