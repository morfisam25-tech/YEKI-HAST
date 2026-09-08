import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../apps/web/app/styles.css', import.meta.url), 'utf8');
const requestProxy = await readFile(new URL('../apps/web/app/api/auth/request/route.ts', import.meta.url), 'utf8');
const verifyProxy = await readFile(new URL('../apps/web/app/api/auth/verify/route.ts', import.meta.url), 'utf8');
const logoutProxy = await readFile(new URL('../apps/web/app/api/auth/logout/route.ts', import.meta.url), 'utf8');

test('web landing states the current email-first scope and closed voice gate in Persian', () => {
  assert.match(page, /در نسخه فعلی/);
  assert.match(page, /تماس صوتی و پرداخت هنوز برای استفاده عمومی/);
  assert.match(page, /ورود با ایمیل/);
  assert.match(page, /یک کد یک‌بارمصرف ۶ رقمی به ایمیل شما فرستاده می‌شود/);
  assert.match(page, /href="\/talk"/);
  assert.match(page, /دیدن مسیر گفت‌وگو/);
  assert.match(page, /href="\/listener"/);
  assert.match(page, /درخواست شنونده‌شدن/);
  assert.doesNotMatch(page, /تماس صوتی را مستقیم از اینترنت/);
  assert.doesNotMatch(page, /تماس تلفنی ماسک‌شده فقط مسیر جایگزین است/);
  assert.doesNotMatch(page, /۱۰، ۳۰ و ۶۰ دقیقه/);
  assert.doesNotMatch(page, /HOLD اعتبار/);
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
