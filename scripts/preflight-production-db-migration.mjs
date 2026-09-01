import pg from 'pg';

const expectedMigrations = new Map([
  ['0001_initial.sql', 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09'],
  ['0002_email_auth.sql', '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90'],
]);

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
    for (const migration of migrations.rows) {
      const filename = String(migration.filename ?? '');
      const sha256 = String(migration.sha256 ?? '');
      const expectedSha = expectedMigrations.get(filename);
      if (!expectedSha) throw new Error(`unexpected production migration record: ${filename || 'unknown'}`);
      if (sha256 !== expectedSha) throw new Error(`production migration hash mismatch: ${filename}`);
      applied.set(filename, sha256);
    }

    if (applied.has('0002_email_auth.sql') && !applied.has('0001_initial.sql')) {
      throw new Error('production migration history is out of order');
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
