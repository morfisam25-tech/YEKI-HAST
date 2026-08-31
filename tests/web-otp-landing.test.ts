import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../apps/web/app/styles.css', import.meta.url), 'utf8');
const requestProxy = await readFile(new URL('../apps/web/app/api/auth/request/route.ts', import.meta.url), 'utf8');
const verifyProxy = await readFile(new URL('../apps/web/app/api/auth/verify/route.ts', import.meta.url), 'utf8');
const logoutProxy = await readFile(new URL('../apps/web/app/api/auth/logout/route.ts', import.meta.url), 'utf8');

test('web landing states the exact technical-beta scope and primary email OTP purpose in Persian', () => {
  assert.match(page, /در انتشار عمومی فعلی Web/);
  assert.match(page, /فقط ورود امن با ایمیل و صفحات عمومی حساب و سیاست‌ها باز می‌شوند/);
  assert.match(page, /تماس صوتی هنوز فعال نیست/);
  assert.match(page, /این انتشار Web آن را به‌عنوان قابلیت عمومی باز اعلام نمی‌کند/);
  assert.match(page, /ورود با ایمیل/);
  assert.match(page, /یک کد یک‌بارمصرف ۶ رقمی به ایمیل شما فرستاده می‌شود/);
  assert.match(page, /شماره تماس صوتی فقط پس از باز شدن قابلیت تماس/);
  assert.doesNotMatch(page, /سرویسی برای گفت‌وگوی صوتی با شنونده‌های انسانی تأییدشده/);
  assert.doesNotMatch(page, /ورود با شماره موبایل|پیامک‌شده/);
});

test('web email login stays same-origin and proxies to the backend email auth API', () => {
  assert.match(page, /\/api\/auth\/request/);
  assert.match(page, /\/api\/auth\/verify/);
  assert.match(requestProxy, /\/v1\/auth\/email\/request/);
  assert.match(verifyProxy, /\/v1\/auth\/email\/verify/);
  assert.match(page, /if \(!response\.ok\) throw new Error/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

test('web verified session is HttpOnly and logout revokes the backend session best-effort', () => {
  assert.match(verifyProxy, /httpOnly: true/);
  assert.match(verifyProxy, /sameSite: 'strict'/);
  assert.match(logoutProxy, /\/v1\/auth\/logout/);
  assert.match(logoutProxy, /store\.delete\(WEB_SESSION_COOKIE\)/);
  assert.match(logoutProxy, /authorization: `Bearer \$\{token\}`/);
});

test('web landing keeps RTL responsive layouts explicit', () => {
  assert.match(styles, /grid-template-columns/);
  assert.match(styles, /@media \(max-width: 800px\)/);
});
