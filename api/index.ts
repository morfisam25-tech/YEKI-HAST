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

  const { handleApiRequest } = await import('../services/api/src/handler.ts');
  return handleApiRequest(req, res);
}
