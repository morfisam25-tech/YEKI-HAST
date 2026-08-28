import pg from 'pg';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
try {
  const migrations = await pool.query(`
    SELECT filename, sha256
    FROM public.yeki_hast_schema_migrations
    WHERE filename IN ('0001_initial.sql','0002_email_auth.sql')
  `);
  const migrationMap = new Map(migrations.rows.map((row) => [row.filename, row.sha256]));
  const expectedMigrations = new Map([
    ['0001_initial.sql', 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09'],
    ['0002_email_auth.sql', '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90'],
  ]);
  for (const [filename, expectedSha] of expectedMigrations) {
    if (migrationMap.get(filename) !== expectedSha) throw new Error(`migration tracking mismatch: ${filename}`);
  }

  const emailSchema = await pool.query(`
    SELECT
      to_regclass('private_data.user_emails')::text AS user_emails,
      to_regclass('private_data.email_otp_challenges')::text AS email_otp_challenges
  `);
  if (emailSchema.rows[0]?.user_emails !== 'private_data.user_emails') throw new Error('user_emails schema missing');
  if (emailSchema.rows[0]?.email_otp_challenges !== 'private_data.email_otp_challenges') {
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
  if (row.caller_rate !== '31000' || row.listener_rate !== '21000' || row.spread !== '10000') {
    throw new Error('pricing seed mismatch');
  }
  if (Number(row.billing_increment_seconds) !== 1) throw new Error('billing increment mismatch');

  const languages = await pool.query(`SELECT count(*)::int AS count FROM app.languages WHERE is_active=true`);
  if (Number(languages.rows[0]?.count ?? 0) < 1) throw new Error('language seed missing');

  console.log('production database verification PASS');
} finally {
  await pool.end();
}
