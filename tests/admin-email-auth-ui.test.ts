import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../apps/admin/app/page.tsx', import.meta.url), 'utf8');
const requestRoute = await readFile(new URL('../apps/admin/app/api/auth/request/route.ts', import.meta.url), 'utf8');
const verifyRoute = await readFile(new URL('../apps/admin/app/api/auth/verify/route.ts', import.meta.url), 'utf8');
const logoutRoute = await readFile(new URL('../apps/admin/app/api/auth/logout/route.ts', import.meta.url), 'utf8');

test('admin login uses primary Email OTP rather than making SMS a control-plane dependency', () => {
  assert.match(page, /ورود ادمین با Email OTP/);
  assert.match(page, /ایمیل ادمین/);
  assert.match(page, /JSON\.stringify\(\{ email \}\)/);
  assert.match(page, /JSON\.stringify\(\{ email, code \}\)/);
  assert.doesNotMatch(page, /invalid_phone|sms_delivery_unavailable|شماره موبایل|0912\.\.\./);
  assert.match(requestRoute, /\/v1\/auth\/email\/request/);
  assert.match(verifyRoute, /\/v1\/auth\/email\/verify/);
  assert.doesNotMatch(requestRoute, /\/v1\/auth\/otp\/request/);
  assert.doesNotMatch(verifyRoute, /\/v1\/auth\/otp\/verify/);
});

test('admin browser session remains HttpOnly and is granted only after active-admin check', () => {
  const verifyIndex = verifyRoute.indexOf("'/v1/auth/email/verify'");
  const adminCheckIndex = verifyRoute.indexOf("'/v1/admin/operations/summary'");
  const cookieIndex = verifyRoute.indexOf('store.set(ADMIN_SESSION_COOKIE');
  assert.ok(verifyIndex >= 0 && adminCheckIndex > verifyIndex && cookieIndex > adminCheckIndex);
  assert.match(verifyRoute, /httpOnly: true/);
  assert.match(verifyRoute, /sameSite: 'strict'/);
});

test('admin logout clears local session even if backend revocation is unavailable', () => {
  assert.match(logoutRoute, /store\.delete\(ADMIN_SESSION_COOKIE\)/);
  assert.match(logoutRoute, /\/v1\/auth\/logout/);
  assert.match(logoutRoute, /\.catch\(\(\) => undefined\)/);
});
