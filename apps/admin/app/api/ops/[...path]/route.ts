import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  backendRequest,
  browserMutationAllowed,
  jsonOrNull,
  proxyError,
} from '../../_backend';

type Context = { params: Promise<{ path: string[] }> };

const MAX_ADMIN_MUTATION_BODY_BYTES = 32 * 1024;

function backendPath(parts: string[]): string | null {
  if (!Array.isArray(parts) || parts.length < 1) return null;
  if (parts.some((part) => !/^[A-Za-z0-9._-]+$/.test(part))) return null;
  return `/v1/admin/${parts.map(encodeURIComponent).join('/')}`;
}

async function proxy(request: Request, context: Context) {
  if (request.method !== 'GET' && !browserMutationAllowed(request)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { path } = await context.params;
  const target = backendPath(path);
  if (!target) return NextResponse.json({ error: 'invalid_admin_path' }, { status: 400 });

  const incoming = new URL(request.url);
  let body: string | undefined;
  if (request.method !== 'GET') {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_ADMIN_MUTATION_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_ADMIN_MUTATION_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
  }

  const response = await backendRequest(`${target}${incoming.search}`, {
    method: request.method,
    ...(body ? { body } : {}),
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await jsonOrNull(response);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) store.delete(ADMIN_SESSION_COOKIE);
    return NextResponse.json({ error: proxyError(payload, 'admin_operation_failed') }, { status: response.status });
  }
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(request: Request, context: Context) {
  return proxy(request, context);
}

export async function POST(request: Request, context: Context) {
  return proxy(request, context);
}
