import { NextResponse } from 'next/server';
import { backendRequest, browserMutationAllowed, jsonOrNull, proxyError } from '../../_backend';

export async function POST(request: Request) {
  if (!browserMutationAllowed(request)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  const response = await backendRequest('/v1/auth/email/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const payload = await jsonOrNull(response);
  if (!response.ok) {
    return NextResponse.json({ error: proxyError(payload, 'email_otp_request_failed') }, { status: response.status });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
