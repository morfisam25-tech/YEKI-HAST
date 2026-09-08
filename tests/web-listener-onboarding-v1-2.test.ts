import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const onboarding = await readFile(new URL('../apps/web/app/listener/page.tsx', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../apps/web/app/api/listener/[...path]/route.ts', import.meta.url), 'utf8');

test('Web Listener onboarding reads server bootstrap and current application state', () => {
  assert.match(proxy, /\^bootstrap\$/);
  assert.match(proxy, /\^listener\\\/application\$/);
  assert.match(onboarding, /api<Bootstrap>\('bootstrap'\)/);
  assert.match(onboarding, /api<Application>\('listener\/application'\)/);
  assert.match(onboarding, /listener_application_not_found/);
});

test('Web Listener profile application avoids collecting KYC identity in the public-profile step', () => {
  assert.match(onboarding, /nickname: nickname\.trim\(\)/);
  assert.match(onboarding, /shortIntro: shortIntro\.trim\(\) \|\| undefined/);
  assert.match(onboarding, /listeningStyle: listeningStyle\.trim\(\) \|\| undefined/);
  assert.match(onboarding, /languages: selectedLanguages\.map/);
  assert.match(onboarding, /معرفی کوتاه برای پروفایل/);
  const applicationBlock = onboarding.slice(onboarding.indexOf('async function createApplication'), onboarding.indexOf('async function completeModule'));
  assert.doesNotMatch(applicationBlock, /nationalId|bankIban|legalName|dateOfBirth/);
});

test('Web Listener training keeps the four backend progress modules and teaches seven real lessons', () => {
  for (const moduleKey of ['active_listening', 'role_boundary', 'safety', 'platform_rules']) {
    assert.match(onboarding, new RegExp(moduleKey));
  }
  for (const lesson of [
    'درس ۱ — نقش شنونده',
    'درس ۲ — گوش‌دادن فعال',
    'درس ۳ — چه چیزهایی نگوییم',
    'درس ۴ — مرزهای حرفه‌ای و رفتاری',
    'درس ۵ — وقتی موضوع از توان نقش شنونده بیرون است',
    'درس ۶ — پایان‌دادن درست به گفتگو',
    'درس ۷ — نمونه‌های واقعی',
  ]) {
    assert.match(onboarding, new RegExp(lesson));
  }
  assert.match(onboarding, /پاسخ ضعیف/);
  assert.match(onboarding, /پاسخ بهتر/);
  assert.match(onboarding, /تنهایی/);
  assert.match(onboarding, /فشار کاری/);
  assert.match(onboarding, /تو جای من بودی چی کار می‌کردی/);
  assert.match(onboarding, /محتوای جنسی/);
  assert.doesNotMatch(onboarding, /سکس‌چت/);
  assert.match(onboarding, /listener\/training\/complete/);
});

test('Web Listener assessment tests taught behavior and remains server-reviewed', () => {
  assert.match(onboarding, /scenarioVersion: 'listener-training-v2'/);
  assert.match(onboarding, /listener\/assessment/);
  assert.match(onboarding, /q_venting/);
  assert.match(onboarding, /q_open_question/);
  assert.match(onboarding, /q_advice/);
  assert.match(onboarding, /q_validation/);
  assert.match(onboarding, /q_silence/);
  assert.match(onboarding, /q_contact/);
  assert.match(onboarding, /q_safety/);
  assert.match(onboarding, /q_closing/);
  assert.match(onboarding, /assessment\?\.result === 'pending'/);
  assert.match(onboarding, /assessment\?\.result === 'failed'/);
  assert.match(onboarding, /assessment\?\.result === 'passed'/);
  assert.match(onboarding, /نتیجه پس از بررسی روی همین صفحه نمایش داده می‌شود/);
  assert.match(onboarding, /نیاز به مرور بیشتر/);
  assert.match(onboarding, /آماده ادامه مسیر/);
  assert.doesNotMatch(onboarding, /setApplication\([^\n]*assessment_passed|setKycStatus\([^\n]*verified/);
});

test('Web Listener KYC keeps private identity separate and never treats submit as verification', () => {
  assert.match(onboarding, /api<KycStatus>\('listener\/kyc'\)/);
  assert.match(onboarding, /legalName: legalName\.trim\(\)/);
  assert.match(onboarding, /nationalId: normalizedNationalId/);
  assert.match(onboarding, /dateOfBirthJalali: normalizedBirth/);
  assert.match(onboarding, /bankIban: normalizedIban/);
  assert.match(onboarding, /در پروفایل عمومی نمایش داده نمی‌شود/);
  assert.match(onboarding, /فرستادن فرم به معنی تأیید فوری نیست/);
  assert.match(onboarding, /ثبت اطلاعات برای بررسی/);
  assert.doesNotMatch(onboarding, /rejectedReasonCode\s*\?/);
});

test('Web Listener ready state does not advertise closed public conversation or payout capability', () => {
  assert.match(onboarding, /\['approved', 'active'\]\.includes\(application\.status\)/);
  assert.match(onboarding, /گفت‌وگوی عمومی هنوز برای استفاده همگانی باز نشده است/);
  assert.match(onboarding, /به معنی فعال‌بودن فوری دریافت گفتگو، پرداخت یا تسویه نیست/);
  assert.doesNotMatch(onboarding, /href="\/listener\/work"/);
});

test('Web Listener onboarding contains no local fake approval, KYC or provider success path', () => {
  assert.doesNotMatch(onboarding, /mock_kyc|fake_kyc|dev_kyc|fake_approval|mock_approval|provider_success/);
  assert.doesNotMatch(onboarding, /localStorage|sessionStorage/);
});
