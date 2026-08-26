import type { IncomingMessage, ServerResponse } from 'node:http';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(payload));
  res.end(payload);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(res, 200, {
      ok: true,
      service: 'yeki-hast-api',
      version: '0.0.8',
      ...(url.pathname === '/' ? { endpoints: ['/health', '/ready', '/v1/bootstrap'] } : {}),
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/ready') {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      sendJson(res, 503, { ok: false, stage: 'database_env_missing' });
      return;
    }

    let PoolCtor: typeof import('pg').Pool;
    try {
      const pg = await import('pg');
      PoolCtor = pg.Pool;
    } catch (error) {
      console.error('readiness_pg_import_failed', error);
      sendJson(res, 500, {
        ok: false,
        stage: 'database_driver_failed',
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return;
    }

    const pool = new PoolCtor({
      connectionString,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });

    try {
      await pool.query('SELECT 1');
      sendJson(res, 200, { ok: true, database: 'ready' });
    } catch (error) {
      console.error('readiness_database_query_failed', error);
      sendJson(res, 503, {
        ok: false,
        stage: 'database_query_failed',
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    } finally {
      await pool.end().catch(() => undefined);
    }
    return;
  }

  try {
    const { handleApiRequest } = await import('../services/api/src/handler.ts');
    return await handleApiRequest(req, res);
  } catch (error) {
    console.error('backend_import_failed', error);
    sendJson(res, 500, {
      ok: false,
      stage: 'backend_import_failed',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}
