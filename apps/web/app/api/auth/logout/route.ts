import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { WEB_SESSION_COOKIE, backendRequest } from '../../_backend';

export async function POST() {
  const store = await cookies();
  const token = store.get(WEB_SESSION_COOKIE)?.value ?? null;
  store.delete(WEB_SESSION_COOKIE);

  if (token) {
    await backendRequest('/v1/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
