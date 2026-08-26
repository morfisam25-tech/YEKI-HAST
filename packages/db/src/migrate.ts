import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { closePool, getPool } from './client.ts';

const here = dirname(fileURLToPath(import.meta.url));
const packedMigration = join(here, '..', 'migrations', '0001_initial.sql.gz.b64');
const migrationFilename = '0001_initial.sql';
const advisoryLockKey = 742_019_911;

async function main() {
  const encoded = (await readFile(packedMigration, 'utf8')).trim();
  const sql = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  const sha256 = createHash('sha256').update(sql).digest('hex');

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

    const existing = await client.query<{ sha256: string }>(
      'SELECT sha256 FROM public.yeki_hast_schema_migrations WHERE filename=$1', [migrationFilename],
    );
    if (existing.rowCount) {
      if (existing.rows[0].sha256 !== sha256) {
        throw new Error(`Applied migration changed on disk: ${migrationFilename}`);
      }
      console.log(`skip ${migrationFilename}`);
      return;
    }

    console.log(`apply ${migrationFilename}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO public.yeki_hast_schema_migrations(filename, sha256) VALUES ($1,$2)',
        [migrationFilename, sha256],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
