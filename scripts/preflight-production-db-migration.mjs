import pg from 'pg';

const expectedMigrationEntries = [
  ['0001_initial.sql', 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09'],
  ['0002_email_auth.sql', '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90'],
  ['0003_internet_voice_transport.sql', '5a2943f0cf6238776b607836b3b3bbf0b464ba0548e80373db781ce1a7c9359d'],
  ['0004_booking.sql', '63f4070bdd1b6f89cca95eaa63a681ec31a246f13ac10a14ba814f98d887d4e3'],
  ['0005_no_answer_hold_idempotency.sql', '7456314e4969ba9536f21ca3c9de0ab4f665ba6f236cddea5832a43601b0ef3c'],
  ['0006_internet_voice_server_sweeper.sql', 'efb704ec5b6233364f6987a347ecd48b4315728dc9c0ddb0f0e8b4b3b4d0f254'],
];
const expectedMigrations = new Map(expectedMigrationEntries);


function normalizedDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (!isLocal) url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

const rawConnectionString = process.env.DATABASE_URL?.trim();
if (!rawConnectionString) throw new Error('DATABASE_URL is required');
const connectionString = normalizedDatabaseUrl(rawConnectionString);

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
try {
  const state = await pool.query(`
    SELECT
      to_regnamespace('app') IS NOT NULL AS app_schema,
      to_regnamespace('private_data') IS NOT NULL AS private_schema,
      to_regclass('public.yeki_hast_schema_migrations') IS NOT NULL AS migration_table
  `);
  const row = state.rows[0] ?? {};
  const appSchema = row.app_schema === true;
  const privateSchema = row.private_schema === true;
  const migrationTable = row.migration_table === true;

  if (!migrationTable) {
    if (appSchema || privateSchema) {
      throw new Error('untracked application schema exists before first production migration');
    }
    console.log('production migration preflight PASS (fresh database; read-only)');
  } else {
    const migrations = await pool.query(`
      SELECT filename, sha256
      FROM public.yeki_hast_schema_migrations
      ORDER BY filename
    `);
    const applied = new Map();
    for (let index = 0; index < migrations.rows.length; index += 1) {
      const migration = migrations.rows[index];
      const filename = String(migration.filename ?? '');
      const sha256 = String(migration.sha256 ?? '');
      const expectedEntry = expectedMigrationEntries[index];
      if (!expectedEntry || filename !== expectedEntry[0]) {
        throw new Error(`production migration history is out of order or unexpected: ${filename || 'unknown'}`);
      }
      const expectedSha = expectedMigrations.get(filename);
      if (sha256 !== expectedSha) throw new Error(`production migration hash mismatch: ${filename}`);
      applied.set(filename, sha256);
    }

    if (!applied.has('0001_initial.sql') && (appSchema || privateSchema)) {
      throw new Error('application schemas exist without tracked initial migration');
    }
    if (applied.has('0001_initial.sql') && (!appSchema || !privateSchema)) {
      throw new Error('tracked initial migration is missing required application schemas');
    }

    console.log(`production migration preflight PASS (${applied.size} known migration(s); read-only)`);
  }
} finally {
  await pool.end();
}
