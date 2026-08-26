import type { IncomingMessage, ServerResponse } from 'node:http';
export class HttpError extends Error { constructor(public status: number, public code: string, message = code) { super(message); } }
export function sendJson(res: ServerResponse, status: number, payload: unknown) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(payload)); }
export async function readJson<T>(req: IncomingMessage, maxBytes = 32_768): Promise<T> {
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of req) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); total += buffer.byteLength; if (total > maxBytes) throw new HttpError(413, 'payload_too_large'); chunks.push(buffer); }
  if (!chunks.length) return {} as T;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T; } catch { throw new HttpError(400, 'invalid_json'); }
}
export function requireString(value: unknown, field: string, min = 1, max = 500): string { if (typeof value !== 'string') throw new HttpError(400, 'invalid_field'); const normalized = value.trim(); if (normalized.length < min || normalized.length > max) throw new HttpError(400, 'invalid_field'); return normalized; }
