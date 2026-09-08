import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const onboarding = await readFile(new URL('../apps/web/app/listener/page.tsx', import.meta.url), 'utf8');
const scopedStyles = await readFile(new URL('../apps/web/app/listener/listener.module.css', import.meta.url), 'utf8');

test('Listener preparation keeps the four backend progress contracts', () => {
  for (const moduleKey of ['active_listening', 'role_boundary', 'safety', 'platform_rules']) {
    assert.match(onboarding, new RegExp(`key: '${moduleKey}'`));
  }
  assert.match(onboarding, /listener\/training\/complete/);
  assert.match(onboarding, /scenarioVersion: 'listener-training-v2'/);
});

test('Listener training explicitly teaches privacy, personal boundaries and cultural humility', () => {
  assert.match(onboarding, /برای دوستان بازگو نکنید/);
  assert.match(onboarding, /اسکرین‌شات نگیرید/);
  assert.match(onboarding, /پست یا محتوا منتشر نکنید/);
  assert.match(onboarding, /ضبط یا بازتوزیع نکنید/);
  assert.match(onboarding, /شماره تلفن، شناسه شبکه اجتماعی/);
  assert.match(onboarding, /محتوای جنسی/);
  assert.match(onboarding, /«عادی» شما الزاماً «عادی» او نیست/);
  assert.match(onboarding, /دین یا بی‌دینی/);
  assert.match(onboarding, /مهاجرت/);
});

test('Listener training distinguishes role limits, danger actions and Listener capacity', () => {
  assert.match(onboarding, /«یکی هست» سرویس پاسخ اضطراری نیست/);
  assert.match(onboarding, /پایان معمولی/);
  assert.match(onboarding, /مرزبندی/);
  assert.match(onboarding, /پایان ایمنی/);
  assert.match(onboarding, /خروج امن \+ بلاک/);
  assert.match(onboarding, /Pause/);
  assert.match(onboarding, /Offline/);
  assert.match(onboarding, /شما مسئول حل زندگی کاربر نیستید/);
});

test('Listener status and KYC copy stay explicit without inventing review promises', () => {
  assert.match(onboarding, /درخواست شما در وضعیت فعلی تأیید نشده است/);
  assert.match(onboarding, /این صفحه مسیر تازه‌ای برای ارسال دوباره نشان نمی‌دهد/);
  assert.match(onboarding, /فرستادن فرم به معنی تأیید فوری نیست/);
  assert.match(onboarding, /به معنی فعال‌بودن فوری پرداخت، تسویه یا دریافت تماس نیست/);
  assert.doesNotMatch(onboarding, /ظرف \d+ (ساعت|روز)/);
  assert.doesNotMatch(onboarding, /رمزنگاری‌شده|رمزگذاری‌شده/);
});

test('Listener training uses page-scoped progressive mobile styling', () => {
  assert.match(onboarding, /import styles from '\.\/listener\.module\.css'/);
  assert.match(onboarding, /activeModule/);
  assert.match(scopedStyles, /\.moduleTabs/);
  assert.match(scopedStyles, /@media \(max-width: 520px\)/);
});
