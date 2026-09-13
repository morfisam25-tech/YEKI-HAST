import pg from 'pg';
import { currentMigrationEntries } from './current-migration-manifest.mjs';

function normalizedDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (!isLocal) url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

const rawConnectionString = process.env.DATABASE_URL?.trim();
if (!rawConnectionString) throw new Error('DATABASE_URL is required');
const connectionString = normalizedDatabaseUrl(rawConnectionString);

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
try {
  const migrations = await pool.query(`
    SELECT filename, sha256
    FROM public.yeki_hast_schema_migrations
    ORDER BY filename
  `);
  const expectedMigrationEntries = await currentMigrationEntries();
  const expectedMigrations = new Map(expectedMigrationEntries);
  const migrationMap = new Map();
  for (const migration of migrations.rows) {
    const filename = String(migration.filename ?? '');
    const sha256 = String(migration.sha256 ?? '');
    if (!expectedMigrations.has(filename)) throw new Error(`unexpected production migration record: ${filename || 'unknown'}`);
    migrationMap.set(filename, sha256);
  }
  if (migrationMap.size !== expectedMigrations.size) throw new Error('production migration history is incomplete');
  for (const [filename, expectedSha] of expectedMigrations) {
    if (migrationMap.get(filename) !== expectedSha) throw new Error(`migration tracking mismatch: ${filename}`);
  }

  // Migration history alone is not enough: a table or trigger can be removed after
  // a migration was recorded. Verify the runtime-critical surface read-only before deploy.
  const criticalRelations = [
    'public.yeki_hast_schema_migrations',
    'app.users',
    'app.admin_users',
    'app.user_roles',
    'app.audit_logs',
    'app.products',
    'app.service_catalog',
    'app.markets',
    'app.languages',
    'app.pricing_plans',
    'app.caller_profiles',
    'app.caller_age_assertions',
    'app.waitlist_entries',
    'app.listener_applications',
    'app.listener_application_languages',
    'app.listener_training_progress',
    'app.listener_assessment_attempts',
    'app.listener_profiles',
    'app.listener_service_profiles',
    'app.listener_languages',
    'app.listener_presence',
    'app.listener_work_sessions',
    'app.wallets',
    'app.wallet_transactions',
    'app.wallet_hold_events',
    'app.internet_voice_signals',
    'app.listener_availability',
    'app.call_reservations',
    'app.call_ratings',
    'app.caller_favorite_listeners',
    'app.caller_quote_bindings',
    'app.payment_attempts',
    'app.reservations',
    'app.call_sessions',
    'app.call_events',
    'app.telephony_legs',
    'app.listener_earnings',
    'app.listener_guarantee_programs',
    'app.listener_guarantee_assignments',
    'app.payouts',
    'app.payout_items',
    'app.blocks',
    'app.reports',
    'app.safety_events',
    'private_data.auth_sessions',
    'private_data.user_contacts',
    'private_data.listener_kyc',
    'private_data.user_emails',
    'private_data.email_otp_challenges',
    'private_data.report_details',
    'private_data.safety_event_details',
  ];
  const relations = await pool.query(`
    SELECT r.relation_name, to_regclass(r.relation_name) IS NOT NULL AS present
    FROM unnest($1::text[]) AS r(relation_name)
  `, [criticalRelations]);
  for (const row of relations.rows) {
    if (row.present !== true) throw new Error(`critical relation missing: ${row.relation_name}`);
  }

  const w3Schema = await pool.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='app' AND table_name='caller_profiles'
          AND column_name='market_id'
      ) AS caller_profile_market,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='app' AND table_name='call_reservations'
          AND column_name='caller_market_id' AND is_nullable='NO'
      ) AS reservation_caller_market,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='app' AND table_name='call_sessions'
          AND column_name='caller_market_id' AND is_nullable='NO'
      ) AS call_caller_market,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='app' AND table_name='call_sessions'
          AND column_name='listener_currency_code' AND is_nullable='NO'
      ) AS listener_currency,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='app' AND table_name='call_sessions'
          AND column_name='platform_contribution_minor' AND is_nullable='YES'
      ) AS cross_currency_contribution_nullable,
      (
        SELECT count(*)=9
        FROM information_schema.columns
        WHERE table_schema='app' AND table_name='caller_quote_bindings'
          AND column_name IN (
            'caller_user_id','caller_market_id','pricing_plan_id','quote_target',
            'max_billable_seconds','booking_id','authorized_minor','currency_code','expires_at'
          )
      ) AS quote_binding_columns,
      (
        SELECT count(*)=5
        FROM information_schema.columns
        WHERE table_schema='app' AND table_name='call_ratings'
          AND column_name IN ('call_session_id','caller_user_id','listener_user_id','service_id','rating')
      ) AS call_rating_columns,
      (
        SELECT count(*)=2
        FROM information_schema.columns
        WHERE table_schema='app' AND table_name='caller_favorite_listeners'
          AND column_name IN ('caller_user_id','listener_user_id')
      ) AS favorite_columns
  `);
  const w3 = w3Schema.rows[0] ?? {};
  if (w3.caller_profile_market !== true) throw new Error('Caller persisted market schema missing');
  if (w3.reservation_caller_market !== true) throw new Error('Booking Caller market snapshot missing');
  if (w3.call_caller_market !== true) throw new Error('Call Caller market snapshot missing');
  if (w3.listener_currency !== true) throw new Error('Listener payout currency snapshot missing');
  if (w3.cross_currency_contribution_nullable !== true) throw new Error('cross-currency contribution fail-closed schema missing');
  if (w3.quote_binding_columns !== true) throw new Error('Caller quote binding schema incomplete');
  if (w3.call_rating_columns !== true) throw new Error('Call rating schema incomplete');
  if (w3.favorite_columns !== true) throw new Error('Caller favorite schema incomplete');

  const criticalTriggers = [
    'listener_presence_set_updated_at',
    'payout_items_guard_mutation',
    'payouts_validate_total_before_processing',
    'payouts_guard_status_transition',
  ];
  const triggers = await pool.query(`
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname='app'
      AND t.tgname = ANY($1::text[])
  `, [criticalTriggers]);
  const triggerNames = new Set(triggers.rows.map((row) => row.tgname));
  for (const triggerName of criticalTriggers) {
    if (!triggerNames.has(triggerName)) throw new Error(`critical trigger missing: ${triggerName}`);
  }

  const sweeper = await pool.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS pg_cron,
      current_setting('cron.database_name', true)=current_database() AS pg_cron_database,
      to_regprocedure('app.expire_internet_voice_preconnect(uuid,text)') IS NOT NULL AS preconnect_fn,
      to_regprocedure('app.settle_internet_voice_call(uuid,text,text,boolean,timestamptz)') IS NOT NULL AS settlement_fn,
      to_regprocedure('app.sweep_internet_voice_sessions(integer)') IS NOT NULL AS sweep_fn,
      to_regprocedure('app.ensure_internet_voice_sweeper_job()') IS NOT NULL AS ensure_job_fn,
      to_regprocedure('app.stop_internet_voice_sweeper_if_idle()') IS NOT NULL AS stop_job_fn
  `);
  const sweeperRow = sweeper.rows[0] ?? {};
  if (sweeperRow.pg_cron !== true) throw new Error('pg_cron extension missing');
  if (sweeperRow.pg_cron_database !== true) throw new Error('pg_cron database target mismatch');
  if (sweeperRow.preconnect_fn !== true) throw new Error('Internet Voice preconnect finalizer missing');
  if (sweeperRow.settlement_fn !== true) throw new Error('Internet Voice settlement function missing');
  if (sweeperRow.sweep_fn !== true) throw new Error('Internet Voice sweeper function missing');
  if (sweeperRow.ensure_job_fn !== true) throw new Error('Internet Voice sweeper ensure function missing');
  if (sweeperRow.stop_job_fn !== true) throw new Error('Internet Voice sweeper stop function missing');

  // The sweeper is intentionally on-demand. With no active Internet Voice session there
  // may be no cron row at all. When an active session exists, exactly one valid 10-second
  // job must exist. Any stale/misconfigured row is a release blocker either way.
  const scheduler = await pool.query(`
    SELECT
      (
        SELECT count(*)::int
        FROM app.call_sessions
        WHERE transport='internet_voice'
          AND status IN ('calling_listener','connected')
      ) AS active_voice_calls,
      (
        SELECT count(*)::int
        FROM cron.job
        WHERE jobname='yeki_hast_internet_voice_sweep'
          AND schedule='10 seconds'
          AND active=true
          AND database=current_database()
          AND username=current_user
          AND command='SELECT * FROM app.sweep_internet_voice_sessions(100);'
      ) AS valid_jobs,
      (
        SELECT count(*)::int
        FROM cron.job
        WHERE jobname='yeki_hast_internet_voice_sweep'
          AND NOT (
            schedule='10 seconds'
            AND active=true
            AND database=current_database()
            AND username=current_user
            AND command='SELECT * FROM app.sweep_internet_voice_sessions(100);'
          )
      ) AS invalid_jobs
  `);
  const schedulerRow = scheduler.rows[0] ?? {};
  const activeVoiceCalls = Number(schedulerRow.active_voice_calls ?? -1);
  const validJobs = Number(schedulerRow.valid_jobs ?? -1);
  const invalidJobs = Number(schedulerRow.invalid_jobs ?? -1);
  if (!Number.isSafeInteger(activeVoiceCalls) || activeVoiceCalls < 0) throw new Error('Internet Voice active-call count invalid');
  if (!Number.isSafeInteger(validJobs) || validJobs < 0 || validJobs > 1) throw new Error('Internet Voice sweeper job count invalid');
  if (!Number.isSafeInteger(invalidJobs) || invalidJobs !== 0) throw new Error('Internet Voice sweeper cron job invalid');
  if (activeVoiceCalls > 0 && validJobs !== 1) throw new Error('Internet Voice sweeper cron job missing for active session');

  const emailSchema = await pool.query(`
    SELECT
      to_regclass('private_data.user_emails') IS NOT NULL AS user_emails,
      to_regclass('private_data.email_otp_challenges') IS NOT NULL AS email_otp_challenges
  `);
  if (emailSchema.rows[0]?.user_emails !== true) throw new Error('user_emails schema missing');
  if (emailSchema.rows[0]?.email_otp_challenges !== true) {
    throw new Error('email_otp_challenges schema missing');
  }

  const result = await pool.query(`
    SELECT p.brand_name, m.code AS market_code, pp.currency_code,
           pp.caller_rate_per_minute_minor::text AS caller_rate,
           pp.listener_rate_per_minute_minor::text AS listener_rate,
           pp.platform_spread_per_minute_minor::text AS spread,
           pp.billing_increment_seconds
    FROM app.pricing_plans pp
    JOIN app.products p ON p.id=pp.product_id
    JOIN app.service_catalog s ON s.id=pp.service_id
    JOIN app.markets m ON m.id=pp.market_id
    WHERE p.code='yeki_hast' AND s.code='human_listening' AND m.code='ir' AND pp.is_active=true
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) throw new Error('active Iran pricing seed missing');
  if (row.brand_name !== 'یکی هست') throw new Error('brand seed mismatch');
  if (row.currency_code !== 'IRR') throw new Error('currency seed mismatch');
  if (row.caller_rate !== '40000' || row.listener_rate !== '28000' || row.spread !== '12000') {
    throw new Error('pricing seed mismatch');
  }
  if (Number(row.billing_increment_seconds) !== 1) throw new Error('billing increment mismatch');

  const languages = await pool.query(`SELECT count(*)::int AS count FROM app.languages WHERE is_active=true`);
  if (Number(languages.rows[0]?.count ?? 0) < 1) throw new Error('language seed missing');

  console.log('production database verification PASS');
} finally {
  await pool.end();
}
