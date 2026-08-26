import { NextResponse } from 'next/server';
import { backendRequest, jsonOrNull, proxyError } from '../../_backend';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { phone?: unknown } | null;
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  if (!phone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });

  const response = await backendRequest('/v1/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
  const payload = await jsonOrNull(response);
  if (!response.ok) {
    return NextResponse.json({ error: proxyError(payload, 'otp_request_failed') }, { status: response.status });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
