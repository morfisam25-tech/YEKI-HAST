import pg from 'pg';

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
  const expectedMigrations = new Map([
    ['0001_initial.sql', 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09'],
    ['0002_email_auth.sql', '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90'],
    ['0003_internet_voice_transport.sql', '5a2943f0cf6238776b607836b3b3bbf0b464ba0548e80373db781ce1a7c9359d'],
    ['0004_booking.sql', '63f4070bdd1b6f89cca95eaa63a681ec31a246f13ac10a14ba814f98d887d4e3'],
    ['0005_no_answer_hold_idempotency.sql', '7456314e4969ba9536f21ca3c9de0ab4f665ba6f236cddea5832a43601b0ef3c'],
    ['0006_internet_voice_server_sweeper.sql', 'efb704ec5b6233364f6987a347ecd48b4315728dc9c0ddb0f0e8b4b3b4d0f254'],
  ]);
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
      to_regprocedure('app.expire_internet_voice_preconnect(uuid,text)') IS NOT NULL AS preconnect_fn,
      to_regprocedure('app.settle_internet_voice_call(uuid,text,text,boolean)') IS NOT NULL AS settlement_fn,
      to_regprocedure('app.sweep_internet_voice_sessions(integer)') IS NOT NULL AS sweep_fn
  `);
  const sweeperRow = sweeper.rows[0] ?? {};
  if (sweeperRow.pg_cron !== true) throw new Error('pg_cron extension missing');
  if (sweeperRow.preconnect_fn !== true) throw new Error('Internet Voice preconnect finalizer missing');
  if (sweeperRow.settlement_fn !== true) throw new Error('Internet Voice settlement function missing');
  if (sweeperRow.sweep_fn !== true) throw new Error('Internet Voice sweeper function missing');

  const cronJob = await pool.query(`
    SELECT 1
    FROM cron.job
    WHERE jobname='yeki_hast_internet_voice_sweep'
      AND schedule='* * * * *'
      AND active=true
    LIMIT 1
  `);
  if (!cronJob.rowCount) throw new Error('Internet Voice sweeper cron job missing');

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
