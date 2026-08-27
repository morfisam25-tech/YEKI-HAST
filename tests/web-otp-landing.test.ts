import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../apps/web/app/styles.css', import.meta.url), 'utf8');

test('web landing explains the product and OTP purpose in Persian', () => {
  assert.match(page, /سرویسی برای گفت‌وگوی صوتی با شنونده‌های انسانی تأییدشده/);
  assert.match(page, /ورود با شماره موبایل/);
  assert.match(page, /برای تأیید شماره موبایل، یک کد یک‌بارمصرف برای شما پیامک می‌شود/);
  assert.match(page, /شماره موبایل شما برای ورود و امنیت حساب استفاده می‌شود/);
});

test('web login uses the existing OTP API and keeps auth fail-closed', () => {
  assert.match(page, /\/v1\/auth\/otp\/request/);
  assert.match(page, /\/v1\/auth\/otp\/verify/);
  assert.match(page, /if \(!response\.ok\) throw new Error/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

test('web landing keeps RTL responsive layouts explicit', () => {
  assert.match(styles, /grid-template-columns/);
  assert.match(styles, /@media \(max-width: 800px\)/);
});
