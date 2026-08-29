import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, backendRequest, browserMutationAllowed } from '../../_backend';

export async function POST(request: Request) {
  if (!browserMutationAllowed(request)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  store.delete(ADMIN_SESSION_COOKIE);

  if (token) {
    await backendRequest('/v1/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
