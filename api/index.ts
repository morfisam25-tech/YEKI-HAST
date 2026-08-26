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
    if (!process.env.DATABASE_URL?.trim()) {
      sendJson(res, 503, { ok: false, stage: 'database_env_missing' });
      return;
    }

    try {
      const db = await import('../packages/db/src/client.ts');
      try {
        await db.query('SELECT 1');
        sendJson(res, 200, { ok: true, database: 'ready' });
      } catch (error) {
        console.error('readiness_database_query_failed', error);
        sendJson(res, 503, {
          ok: false,
          stage: 'database_query_failed',
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      }
    } catch (error) {
      console.error('readiness_database_module_failed', error);
      sendJson(res, 500, {
        ok: false,
        stage: 'database_module_failed',
        errorType: error instanceof Error ? error.name : 'unknown',
      });
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
