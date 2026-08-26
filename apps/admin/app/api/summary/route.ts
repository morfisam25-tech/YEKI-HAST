import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  backendRequest,
  jsonOrNull,
  proxyError,
} from '../_backend';

export async function GET() {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const response = await backendRequest('/v1/admin/operations/summary', {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await jsonOrNull(response);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) store.delete(ADMIN_SESSION_COOKIE);
    return NextResponse.json({ error: proxyError(payload, 'summary_failed') }, { status: response.status });
  }
  return NextResponse.json(payload);
}
