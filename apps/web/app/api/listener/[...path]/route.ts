import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  WEB_SESSION_COOKIE,
  backendRequest,
  browserMutationAllowed,
  jsonOrNull,
  proxyError,
} from '../../_backend';

const UUID = '[0-9a-fA-F-]{36}';
const ALLOWED_PATHS = [
  /^bootstrap$/,
  /^listener\/application$/,
  /^listener\/training\/complete$/,
  /^listener\/assessment$/,
  /^listener\/kyc$/,
  /^listener\/presence$/,
  /^listener\/presence\/heartbeat$/,
  /^listener\/earnings$/,
  /^listener\/availability$/,
  new RegExp(`^listener\/availability\/${UUID}\/cancel$`),
  /^listener\/bookings$/,
  /^listener\/calls\/active$/,
  /^listener\/calls\/recent$/,
  new RegExp(`^calls\/${UUID}$`),
  new RegExp(`^calls\/${UUID}\/voice\/(config|signals|heartbeat|end|safety-exit|media-auth)$`),
  /^safety\/(report|block)$/,
];
const MAX_PROXY_BODY_BYTES = 64 * 1024;

type RouteContext = { params: Promise<{ path: string[] }> };

function normalizedPath(parts: string[]): string | null {
  const path = parts.map((part) => part.trim()).filter(Boolean).join('/');
  if (!path || !ALLOWED_PATHS.some((pattern) => pattern.test(path))) return null;
  return path;
}

async function proxy(request: Request, context: RouteContext, method: 'GET' | 'POST') {
  if (method === 'POST' && !browserMutationAllowed(request)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const { path: parts } = await context.params;
  const path = normalizedPath(parts);
  if (!path) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const store = await cookies();
  const token = store.get(WEB_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  const sourceUrl = new URL(request.url);
  const targetPath = `/v1/${path}${method === 'GET' ? sourceUrl.search : ''}`;
  let body: string | undefined;
  if (method === 'POST') {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_PROXY_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
  }

  let upstream: Response;
  try {
    upstream = await backendRequest(targetPath, {
      method,
      headers: { authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'backend_unavailable' }, { status: 503 });
  }

  const payload = await jsonOrNull(upstream);
  if (payload === null) {
    return NextResponse.json(
      { error: proxyError(null, upstream.ok ? 'invalid_backend_response' : 'backend_request_failed') },
      { status: upstream.ok ? 502 : upstream.status },
    );
  }
  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context, 'GET');
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context, 'POST');
}
