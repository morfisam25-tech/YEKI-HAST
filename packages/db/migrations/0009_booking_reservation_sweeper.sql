-- Proactively expire due Booking reservations instead of waiting for a booking-list read.
-- Reuses the pg_cron setup already required by the Internet Voice sweeper, but uses a
-- separate named job and does not modify the Internet Voice scheduler or sweep function.

DO $$
BEGIN
  IF current_setting('cron.database_name', true) IS DISTINCT FROM current_database() THEN
    RAISE EXCEPTION 'booking_pg_cron_database_not_configured'
      USING HINT = 'Set the Neon compute setting cron.database_name to ' || current_database()
        || ' and restart the compute before applying migration 0009.';
  END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION app.ensure_booking_reservation_sweeper_job()
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id bigint;
  v_schedule text;
  v_command text;
  v_database text;
  v_duplicate_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(742019913);

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    RAISE EXCEPTION 'booking_pg_cron_not_installed';
  END IF;

  -- Defensive cleanup in case a prior manual/partial run created duplicate named jobs.
  FOR v_duplicate_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname='yeki_hast_booking_reservation_sweep'
    ORDER BY jobid
    OFFSET 1
  LOOP
    PERFORM cron.unschedule(v_duplicate_id);
  END LOOP;

  SELECT jobid, schedule, command, database
  INTO v_job_id, v_schedule, v_command, v_database
  FROM cron.job
  WHERE jobname='yeki_hast_booking_reservation_sweep'
  ORDER BY jobid
  LIMIT 1;

  IF v_job_id IS NOT NULL
     AND (
       v_schedule IS DISTINCT FROM '* * * * *'
       OR v_command IS DISTINCT FROM 'SELECT app.expire_due_call_reservations();'
       OR v_database IS DISTINCT FROM current_database()
     ) THEN
    PERFORM cron.unschedule(v_job_id);
    v_job_id := NULL;
  END IF;

  IF v_job_id IS NULL THEN
    SELECT cron.schedule(
      'yeki_hast_booking_reservation_sweep',
      '* * * * *',
      'SELECT app.expire_due_call_reservations();'
    ) INTO v_job_id;
  END IF;

  RETURN v_job_id;
END;
$$;

SELECT app.ensure_booking_reservation_sweeper_job();
