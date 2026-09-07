import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { closePool, getPool } from './client.ts';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const advisoryLockKey = 742_019_911;

type MigrationSource = {
  filename: string;
  path: string;
  packed?: boolean;
};

const migrationSources: MigrationSource[] = [
  {
    filename: '0001_initial.sql',
    path: join(migrationsDir, '0001_initial.sql.gz.b64'),
    packed: true,
  },
  {
    filename: '0002_email_auth.sql',
    path: join(migrationsDir, '0002_email_auth.sql'),
  },
  {
    filename: '0003_internet_voice_transport.sql',
    path: join(migrationsDir, '0003_internet_voice_transport.sql'),
  },
  {
    filename: '0004_booking.sql',
    path: join(migrationsDir, '0004_booking.sql'),
  },
  {
    filename: '0005_no_answer_hold_idempotency.sql',
    path: join(migrationsDir, '0005_no_answer_hold_idempotency.sql'),
  },
];

async function loadMigration(source: MigrationSource): Promise<string> {
  const raw = await readFile(source.path, 'utf8');
  if (!source.packed) return raw;
  return gunzipSync(Buffer.from(raw.trim(), 'base64')).toString('utf8');
}

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockKey]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.yeki_hast_schema_migrations (
        filename text PRIMARY KEY,
        sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const source of migrationSources) {
      const sql = await loadMigration(source);
      const sha256 = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ sha256: string }>(
        'SELECT sha256 FROM public.yeki_hast_schema_migrations WHERE filename=$1', [source.filename],
      );
      if (existing.rowCount) {
        if (existing.rows[0].sha256 !== sha256) {
          throw new Error(`Applied migration changed on disk: ${source.filename}`);
        }
        console.log(`skip ${source.filename}`);
        continue;
      }

      console.log(`apply ${source.filename}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.yeki_hast_schema_migrations(filename, sha256) VALUES ($1,$2)',
          [source.filename, sha256],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockKey]); } catch {}
    client.release();
  }
}

main().finally(closePool).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
