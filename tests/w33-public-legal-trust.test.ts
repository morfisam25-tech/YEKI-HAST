import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const terms = await read('apps/web/app/terms/page.tsx');
const privacy = await read('apps/web/app/privacy/page.tsx');
const talk = await read('apps/web/app/talk/page.tsx');
const booking = await read('apps/web/app/booking/page.tsx');
const bookingCall = await read('apps/web/app/booking/call/page.tsx');
const childSafety = await read('apps/web/app/safety/children/page.tsx');
const callerRoute = await read('services/api/src/routes/caller.ts');
const securityVerifier = await read('scripts/verify-production-security-config.mjs');
const envSync = await read('scripts/sync-vercel-production-env.mjs');
const mobileApp = await read('apps/mobile/App.tsx');
const mobileRoot = await read('apps/mobile/RootApp.tsx');

test('terms locks the public product, 18+, billing, recording and profile truth', () => {
  for (const marker of [
    'فقط برای افراد ۱۸ سال و بالاتر', 'شنونده انسانی', 'روان‌درمانی', 'دوست‌یابی', 'اسکورت',
    'سرویس اضطراری نیست', 'ضبط تماس توسط پلتفرم', 'WebRTC', 'TURN', 'اتصال واقعی',
    'هزینه‌ای کسر نمی‌شود', 'خوداظهاری‌اند', 'صدای تماس ضبط نمی‌شود',
  ]) assert.match(terms, new RegExp(marker));
  assert.doesNotMatch(terms, /بعداً به‌صراحت ارائه شود|هر زمان تماس صوتی/);
});

test('privacy discloses runtime data without audio monitoring or invented retention periods', () => {
  for (const marker of [
    'اجازه میکروفون', 'WebRTC', 'TURN', 'فراداده تماس', 'کیف پول', 'دفتر مالی',
    'گزارش', 'بلاک', 'ضبط تماس توسط پلتفرم خاموش است', 'تماس‌ها پایش یا شنود نمی‌شوند',
  ]) assert.match(privacy, new RegExp(marker));
  assert.doesNotMatch(privacy, /صددرصد محرمانه|تضمین امنیت/);
});

test('public Caller age policy fails closed unless it is exactly 18 and versions force fresh consent', () => {
  assert.match(callerRoute, /PUBLIC_CALLER_MINIMUM_AGE = 18/);
  assert.match(callerRoute, /minimumAge !== PUBLIC_CALLER_MINIMUM_AGE/);
  assert.match(callerRoute, /terms-2026-09-13/);
  assert.match(callerRoute, /safety-2026-09-13/);
  assert.match(securityVerifier, /CALLER_MINIMUM_AGE', undefined, 18, 18/);
  assert.doesNotMatch(callerRoute, /minimumAge < 13|minimumAge > 99/);
});

test('talk and booking require explicit 18+, terms and safety consent', () => {
  assert.match(talk, /۱۸ سال یا بیشتر/);
  assert.match(talk, /termsAccepted && safetyAccepted/);
  assert.match(booking, /const \[termsAccepted/);
  assert.match(booking, /const \[safetyAccepted/);
  assert.match(booking, /JSON\.stringify\(\{ confirmed: true, termsAccepted, safetyAccepted \}\)/);
  assert.match(booking, /۱۸ سال یا بیشتر/);
});

test('immediate and booked calls expose recording notice, Safety Exit, report and block', () => {
  for (const source of [talk, bookingCall]) {
    assert.match(source, /ضبط تماس توسط پلتفرم خاموش است/);
    assert.match(source, /safety\/report/);
    assert.match(source, /safety\/block/);
  }
  assert.match(talk, /safety-exit/);
  assert.match(bookingCall, /voice\/safety-exit/);
  assert.match(bookingCall, /خروج امن \+ بلاک/);
});

test('public trust, safety, child-safety and FAQ routes exist with non-audio moderation truth', async () => {
  const [trust, safety, faq] = await Promise.all([
    read('apps/web/app/trust/page.tsx'),
    read('apps/web/app/safety/page.tsx'),
    read('apps/web/app/faq/page.tsx'),
  ]);
  assert.match(trust, /صدای ضبط‌شده‌ای برای بررسی وجود ندارد/);
  assert.match(safety, /نه از صدای تماس/);
  assert.match(childSafety, /صدای تماس برای بررسی وجود ندارد/);
  assert.match(faq, /فقط افراد ۱۸ سال و بالاتر/);
});

test('mobile legal links come only from bootstrap and include Child Safety', () => {
  assert.match(mobileRoot, /value\.legal/);
  assert.match(mobileRoot, /childSafetyUrl/);
  assert.match(mobileApp, /legal\?\.privacyPolicyUrl/);
  assert.match(mobileApp, /legal\?\.childSafetyUrl/);
  assert.doesNotMatch(mobileApp, /https:\/\/yekihast\.app|PUBLIC_LINKS/);
});

test('public listener copy scopes account eligibility separately from self-declared fields', async () => {
  for (const source of [talk, booking, mobileApp, await read('apps/mobile/src/CallerClosedBetaScreen.tsx')]) {
    assert.match(source, /خوداظهاری/);
    assert.doesNotMatch(source, /هویت\/فیلدهای تأییدشده مشخص است/);
  }
});

test('release profiles are explicit, production-only, provider-neutral and never auto-open Caller', () => {
  assert.match(envSync, /PRODUCTION_RELEASE_PROFILE/);
  assert.match(envSync, /internal_beta.*public_release/);
  assert.match(envSync, /releaseProfile === 'internal_beta'/);
  assert.match(envSync, /CALLER_MINIMUM_AGE', '18'/);
  assert.match(envSync, /INTERNAL_BETA_OWNER_TEST_MODE', '0'/);
  assert.doesNotMatch(envSync, /setPlain\('CALLER_CLOSED_BETA_ENABLED', 'true'\)/);
  assert.match(envSync, /target: \['production'\]/);
  assert.doesNotMatch(envSync, /target: \['preview'\]/);
});

test('frozen Home files retain the exact approved blobs', async () => {
  const [page, css] = await Promise.all([
    readFile(new URL('../apps/web/app/page.tsx', import.meta.url)),
    readFile(new URL('../apps/web/app/home.module.css', import.meta.url)),
  ]);
  const gitBlob = (value: Buffer) => createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
  assert.equal(gitBlob(page), 'e6074b4bd9e697e75b3eca5e9f8f51535c6780f8');
  assert.equal(gitBlob(css), 'd749d64a2176ef9a0268811ef5ad453f348e5e8f');
});
