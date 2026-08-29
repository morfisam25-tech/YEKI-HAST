import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  WEB_SESSION_COOKIE,
  backendRequest,
  browserMutationAllowed,
  jsonOrNull,
  proxyError,
} from '../../_backend';

export async function POST(request: Request) {
  if (!browserMutationAllowed(request)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const store = await cookies();
  const token = store.get(WEB_SESSION_COOKIE)?.value ?? '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const response = await backendRequest('/v1/account/deletion-request', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await jsonOrNull(response);

  if (!response.ok) {
    if (response.status === 401) store.delete(WEB_SESSION_COOKIE);
    return NextResponse.json(
      { error: proxyError(body, 'account_deletion_request_failed') },
      { status: response.status },
    );
  }

  // The backend revokes every active session as part of accepting the request.
  // Remove the browser cookie in the same response so the UI cannot keep using
  // an already-revoked credential.
  store.delete(WEB_SESSION_COOKIE);
  return NextResponse.json(body ?? { ok: true, status: 'requested' }, { status: 202 });
}
