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
  assert.match(onboarding, /معرفی کوتاه خوداظهاری/);
  const applicationBlock = onboarding.slice(onboarding.indexOf('async function createApplication'), onboarding.indexOf('async function completeModule'));
  assert.doesNotMatch(applicationBlock, /nationalId|bankIban|legalName|dateOfBirth/);
});

test('Web Listener training covers the seven required modules and scenarios', () => {
  for (const moduleKey of ['role_boundary', 'active_listening', 'what_not_to_say', 'platform_rules', 'safety', 'closing_conversation', 'scenarios']) {
    assert.match(onboarding, new RegExp(moduleKey));
  }
  assert.match(onboarding, /سناریوهای تمرینی/);
  assert.match(onboarding, /تنهایی/);
  assert.match(onboarding, /فشار رابطه/);
  assert.match(onboarding, /فشار کاری/);
  assert.match(onboarding, /پاسخ ضعیف/);
  assert.match(onboarding, /پاسخ بهتر/);
  assert.match(onboarding, /listener\/training\/complete/);
  assert.doesNotMatch(onboarding, /سکس‌چت/);
});

test('Web Listener assessment uses the locked scenario version and server-reviewed result', () => {
  assert.match(onboarding, /scenarioVersion: 'listener-beta-v2'/);
  assert.match(onboarding, /listener\/assessment/);
  assert.match(onboarding, /assessment\?\.result === 'pending'/);
  assert.match(onboarding, /assessment\?\.result === 'failed'/);
  assert.match(onboarding, /assessment\?\.result === 'passed'/);
  assert.match(onboarding, /نتیجه فقط بعد از بررسی واقعی تغییر می‌کند/);
  assert.doesNotMatch(onboarding, /setApplication\([^\n]*assessment_passed|setKycStatus\([^\n]*verified/);
});

test('Web Listener KYC keeps private identity separate and never treats submit as verification', () => {
  assert.match(onboarding, /api<KycStatus>\('listener\/kyc'\)/);
  assert.match(onboarding, /legalName: legalName\.trim\(\)/);
  assert.match(onboarding, /nationalId: normalizedNationalId/);
  assert.match(onboarding, /dateOfBirthJalali: normalizedBirth/);
  assert.match(onboarding, /bankIban: normalizedIban/);
  assert.match(onboarding, /برای Caller یا پروفایل عمومی نمایش داده نمی‌شود/);
  assert.match(onboarding, /ثبت فرم به معنی تأیید نیست/);
  assert.match(onboarding, /ثبت برای استعلام واقعی/);
});

test('Web Listener work mode opens only for server approved or active application status', () => {
  assert.match(onboarding, /\['approved', 'active'\]\.includes\(application\.status\)/);
  assert.match(onboarding, /href="\/listener\/work"/);
  assert.match(onboarding, /Online شدن هنوز به معنی Push پس‌زمینه نیست/);
});

test('Web Listener onboarding contains no local fake approval, KYC or provider success path', () => {
  assert.doesNotMatch(onboarding, /mock_kyc|fake_kyc|dev_kyc|fake_approval|mock_approval|provider_success/);
  assert.doesNotMatch(onboarding, /localStorage|sessionStorage/);
});
