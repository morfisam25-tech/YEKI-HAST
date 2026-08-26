import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest } from '../services/api/src/handler.ts';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(payload));
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

export default async function runtimeHandler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');

  // Temporary low-risk probe used to prove that the statically bundled runtime
  // is actually executing in Vercel, not merely compiling successfully.
  if (method === 'GET' && url.pathname === '/v1/runtime-probe') {
    sendJson(res, 200, { ok: true, runtime: 'bundled', version: '0.0.8' });
    return;
  }

  return handleApiRequest(req, res);
}
