import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { WEB_SESSION_COOKIE, backendRequest, jsonOrNull, proxyError } from '../../_backend';

type SessionPayload = { token?: unknown; expiresInHours?: unknown };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!email) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_otp' }, { status: 400 });

  const verified = await backendRequest('/v1/auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  const session = await jsonOrNull(verified) as SessionPayload | null;
  if (!verified.ok) {
    return NextResponse.json({ error: proxyError(session, 'email_otp_verify_failed') }, { status: verified.status });
  }

  const token = typeof session?.token === 'string' ? session.token : '';
  const expiresInHours = Number(session?.expiresInHours);
  if (!token || !Number.isFinite(expiresInHours) || expiresInHours <= 0) {
    return NextResponse.json({ error: 'invalid_session_response' }, { status: 502 });
  }

  const store = await cookies();
  store.set(WEB_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(expiresInHours * 60 * 60),
  });
  return NextResponse.json({ ok: true });
}
