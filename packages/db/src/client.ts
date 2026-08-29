import { Pool, type PoolClient, type QueryResultRow } from 'pg';

let pool: Pool | undefined;

function normalizedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);

  if (!isLocal) {
    // node-postgres treats sslmode=verify-full as certificate + hostname verification.
    // Never silently downgrade a remote database URL to sslmode=require/no-verify.
    url.searchParams.set('sslmode', 'verify-full');
  }

  return url.toString();
}

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  pool ??= new Pool({
    connectionString: normalizedDatabaseUrl(connectionString),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}
