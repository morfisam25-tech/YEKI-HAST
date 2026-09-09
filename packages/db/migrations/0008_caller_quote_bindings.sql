-- Short-lived server-side binding between the quote the Caller saw and the pricebook used
-- for Booking/Call HOLD authorization. This avoids trusting arbitrary client pricing input.

CREATE TABLE IF NOT EXISTS app.caller_quote_bindings (
  caller_user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  caller_market_id uuid NOT NULL REFERENCES app.markets(id),
  pricing_plan_id uuid NOT NULL REFERENCES app.pricing_plans(id),
  quote_target varchar(24) NOT NULL CHECK (quote_target IN ('instant','booking','booking_start')),
  max_billable_seconds integer NOT NULL CHECK (max_billable_seconds IN (600,1800,3600)),
  booking_id uuid REFERENCES app.call_reservations(id) ON DELETE CASCADE,
  authorized_minor bigint NOT NULL CHECK (authorized_minor > 0),
  currency_code varchar(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  quoted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (
    (quote_target='booking_start' AND booking_id IS NOT NULL)
    OR (quote_target IN ('instant','booking') AND booking_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS caller_quote_bindings_expiry_idx
  ON app.caller_quote_bindings(expires_at);
