import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../apps/admin/app/api/_backend.ts', import.meta.url), 'utf8');
const requestRoute = await readFile(new URL('../apps/admin/app/api/auth/request/route.ts', import.meta.url), 'utf8');
const verifyRoute = await readFile(new URL('../apps/admin/app/api/auth/verify/route.ts', import.meta.url), 'utf8');
const logoutRoute = await readFile(new URL('../apps/admin/app/api/auth/logout/route.ts', import.meta.url), 'utf8');
const opsRoute = await readFile(new URL('../apps/admin/app/api/ops/[...path]/route.ts', import.meta.url), 'utf8');

test('admin browser auth is same-origin guarded and body bounded', () => {
  for (const source of [requestRoute, verifyRoute, logoutRoute]) {
    assert.match(source, /browserMutationAllowed\(request\)/);
  }
  assert.match(requestRoute, /MAX_AUTH_BODY_BYTES = 4_096/);
  assert.match(verifyRoute, /MAX_AUTH_BODY_BYTES = 4_096/);
  assert.match(requestRoute, /payload_too_large/);
  assert.match(verifyRoute, /payload_too_large/);
  assert.match(requestRoute, /MAX_EMAIL_LENGTH = 254/);
  assert.match(verifyRoute, /MAX_EMAIL_LENGTH = 254/);
  assert.match(verifyRoute, /\^\\d\{6\}\$/);
});

test('admin session is stored only after active-admin verification and never returned to browser JSON', () => {
  const verifyCall = verifyRoute.indexOf("backendRequest('/v1/auth/email/verify'");
  const adminCheck = verifyRoute.indexOf("backendRequest('/v1/admin/operations/summary'");
  const cookieSet = verifyRoute.indexOf('store.set(ADMIN_SESSION_COOKIE');
  assert.ok(verifyCall >= 0 && adminCheck > verifyCall && cookieSet > adminCheck);
  assert.match(verifyRoute, /httpOnly: true/);
  assert.match(verifyRoute, /sameSite: 'strict'/);
  assert.match(verifyRoute, /return NextResponse\.json\(\{ ok: true \}\)/);
  assert.doesNotMatch(verifyRoute, /NextResponse\.json\([^\n]*token/);
  assert.match(backend, /__Host-yeki_admin_session/);
});

test('admin logout clears browser cookie before best-effort backend revocation', () => {
  const deleteCookie = logoutRoute.indexOf('store.delete(ADMIN_SESSION_COOKIE)');
  const revoke = logoutRoute.indexOf("backendRequest('/v1/auth/logout'");
  assert.ok(deleteCookie >= 0 && revoke > deleteCookie);
  assert.match(logoutRoute, /authorization: `Bearer \$\{token\}`/);
});

test('admin operation proxy stays inside admin namespace and bounds mutation bodies', () => {
  assert.match(opsRoute, /request\.method !== 'GET' && !browserMutationAllowed\(request\)/);
  assert.match(opsRoute, /ADMIN_SESSION_COOKIE/);
  assert.match(opsRoute, /part === '\.'/);
  assert.match(opsRoute, /part === '\.\.'/);
  assert.match(opsRoute, /`\/v1\/admin\/\$\{parts\.map\(encodeURIComponent\)\.join\('\/'\)\}`/);
  assert.match(opsRoute, /MAX_ADMIN_MUTATION_BODY_BYTES = 32 \* 1024/);
  assert.match(opsRoute, /content-length/);
  assert.match(opsRoute, /TextEncoder\(\)\.encode\(body\)\.byteLength/);
  assert.match(opsRoute, /payload_too_large/);
  assert.match(opsRoute, /authorization: `Bearer \$\{token\}`/);
  assert.match(opsRoute, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(opsRoute, /store\.delete\(ADMIN_SESSION_COOKIE\)/);
});
