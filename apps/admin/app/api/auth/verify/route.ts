import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  backendRequest,
  jsonOrNull,
  proxyError,
} from '../../_backend';

type SessionPayload = {
  token?: unknown;
  expiresInHours?: unknown;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { phone?: unknown; code?: unknown } | null;
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!phone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_otp' }, { status: 400 });

  const verified = await backendRequest('/v1/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
  const session = await jsonOrNull(verified) as SessionPayload | null;
  if (!verified.ok) {
    return NextResponse.json({ error: proxyError(session, 'otp_verify_failed') }, { status: verified.status });
  }

  const token = typeof session?.token === 'string' ? session.token : '';
  const expiresInHours = Number(session?.expiresInHours);
  if (!token || !Number.isFinite(expiresInHours) || expiresInHours <= 0) {
    return NextResponse.json({ error: 'invalid_session_response' }, { status: 502 });
  }

  // Confirm the authenticated user is an active admin before storing a browser session.
  const adminCheck = await backendRequest('/v1/admin/operations/summary', {
    headers: { authorization: `Bearer ${token}` },
  });
  const adminPayload = await jsonOrNull(adminCheck);
  if (!adminCheck.ok) {
    const status = adminCheck.status === 403 ? 403 : 502;
    return NextResponse.json({ error: proxyError(adminPayload, 'admin_check_failed') }, { status });
  }

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(expiresInHours * 60 * 60),
  });

  return NextResponse.json({ ok: true });
}
