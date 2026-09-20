import { Pool, type PoolClient, type QueryResultRow } from 'pg';

let pool: Pool | undefined;
let poolConnectionString: string | undefined;

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

function poolMax(): number {
  const fallback = process.env.NODE_ENV === 'production' ? 2 : 10;
  const raw = process.env.DB_POOL_MAX?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error('DB_POOL_MAX must be an integer between 1 and 10');
  }
  return value;
}

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const normalizedConnectionString = normalizedDatabaseUrl(connectionString);

  if (pool && poolConnectionString !== normalizedConnectionString) {
    throw new Error('DATABASE_URL changed after pool initialization');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: normalizedConnectionString,
      // Vercel may create many runtime instances during bursts. Keep each process
      // deliberately small; production is routed through Neon PgBouncer by the
      // controlled environment sync before Caller traffic is ever opened.
      max: poolMax(),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    poolConnectionString = normalizedConnectionString;
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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
  poolConnectionString = undefined;
}
