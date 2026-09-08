import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'));
const mobilePackage = JSON.parse(await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));
const mobileRoot = await readFile(new URL('../apps/mobile/RootApp.tsx', import.meta.url), 'utf8');
const privacyPage = await readFile(new URL('../apps/web/app/privacy/page.tsx', import.meta.url), 'utf8');
const deletionPage = await readFile(new URL('../apps/web/app/account/delete/page.tsx', import.meta.url), 'utf8');
const submissionPacket = await readFile(new URL('../docs/STORE_SUBMISSION_ANSWERS.md', import.meta.url), 'utf8');
const playPacket = await readFile(new URL('../docs/GOOGLE_PLAY_FINAL_PACKET.md', import.meta.url), 'utf8');
const platformRequirements = await readFile(new URL('../docs/STORE_PLATFORM_REQUIREMENTS.md', import.meta.url), 'utf8');

const allMobileDeps = {
  ...(mobilePackage.dependencies ?? {}),
  ...(mobilePackage.devDependencies ?? {}),
};

const analyticsOrAdsPackages = [
  '@sentry/react-native',
  '@react-native-firebase/analytics',
  '@segment/analytics-react-native',
  'expo-firebase-analytics',
  'mixpanel-react-native',
  'react-native-google-mobile-ads',
];

test('store-facing mobile identity remains pinned to the first release', () => {
  assert.equal(appConfig.expo.name, 'یکی هست');
  assert.equal(appConfig.expo.version, '1.0.0');
  assert.equal(appConfig.expo.android.package, 'app.yekihast.mobile');
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'app.yekihast.mobile');
  assert.equal(appConfig.expo.scheme, 'yekihast');
});

test('current Expo framework line matches the recorded 2026 Store platform baseline', () => {
  assert.match(mobilePackage.dependencies?.expo ?? '', /^~57\./);
  assert.match(platformRequirements, /API level 36/);
  assert.match(platformRequirements, /Xcode 26/);
  assert.match(platformRequirements, /SDK 57/);
});

test('privacy policy covers the current listener path and truthfully marks public voice closed', () => {
  assert.match(privacyPage, /نسخه وب و اپ موبایل/);
  assert.match(privacyPage, /نام نمایشی/);
  assert.match(privacyPage, /زبان‌ها و سطح تسلط/);
  assert.match(privacyPage, /معرفی کوتاه اختیاری/);
  assert.match(privacyPage, /SecureStore/);
  assert.match(privacyPage, /گفت‌وگوی صوتی عمومی/);
  assert.match(privacyPage, /برای استفاده عمومی فعال نیستند/);
  assert.match(privacyPage, /RECORD_AUDIO/);
  assert.match(privacyPage, /مسیر عمومی گفت‌وگوی صوتی در نسخه عملیاتی فعلی بسته است/);
  assert.match(privacyPage, /صدای مکالمه از این قابلیت جمع‌آوری یا منتقل نمی‌شود/);
  assert.match(privacyPage, /WebRTC/);
  assert.match(privacyPage, /TURN relay/);
  assert.match(privacyPage, /مسیر.*ضبط یا ذخیره محتوای صوتی مکالمه در backend وجود ندارد/);
  assert.match(privacyPage, /پیش از فعال‌شدن عمومی گفت‌وگوی صوتی/);
  assert.match(privacyPage, /حذف واقعی همان‌جا انجام می‌شود/);
  assert.match(privacyPage, /نگهداری ضروری/);
});

test('account deletion is discoverable in app and truthfully completable from the public web resource', () => {
  assert.match(mobileRoot, />حذف حساب</);
  assert.match(mobileRoot, /accountDeletionUrl/);
  assert.match(deletionPage, /\/api\/account\/deletion-request/);
  assert.match(deletionPage, /payload\.deletionCompleted \? 'completed' : 'requested'/);
  assert.match(deletionPage, /حساب شما حذف شد/);
  assert.match(deletionPage, /نشست‌های فعال بسته می‌شوند/);
});

test('current mobile package has no known analytics or advertising SDK that would invalidate privacy draft', () => {
  for (const dependency of analyticsOrAdsPackages) {
    assert.equal(
      allMobileDeps[dependency],
      undefined,
      `${dependency} requires Store privacy/data-safety review before release`,
    );
  }
});

test('store submission packet is pinned to final vc5 identifiers and current closed production voice gate', () => {
  assert.match(submissionPacket, /app\.yekihast\.mobile/);
  assert.match(submissionPacket, /https:\/\/yekihast\.app\/privacy/);
  assert.match(submissionPacket, /https:\/\/yekihast\.app\/account\/delete/);
  assert.match(submissionPacket, /GOOGLE_PLAY_FINAL_PACKET\.md/);
  assert.match(submissionPacket, /final versionCode: `5`/);
  assert.match(submissionPacket, /target SDK: Android 16 \/ API 36/);
  assert.match(submissionPacket, /51dc645a-b56f-4428-91b5-73337898f870/);
  assert.match(submissionPacket, /f843909c6a239d784f38c97c304310a64a7e4ab5c59410cd905de8b89bd06e32/);
  assert.match(submissionPacket, /RECORD_AUDIO/);
  assert.match(submissionPacket, /Microphone permission: \*\*Yes\*\*/);
  assert.match(submissionPacket, /Camera permission: No/);
  assert.match(submissionPacket, /Audio files \/ Voice or sound recordings — Collected: \*\*No\*\*/);
  assert.match(submissionPacket, /Audio files \/ Voice or sound recordings — Shared: \*\*No\*\*/);
  assert.match(submissionPacket, /Caller closed beta is disabled/);
  assert.match(submissionPacket, /no TURN\/ICE relay is configured/);
  assert.match(submissionPacket, /vc2\/vc3\/vc4 are superseded/);
  assert.match(submissionPacket, /AndroidX ProfileInstaller receiver protection/);
  assert.match(submissionPacket, /Apple \/ iOS — parked/);
});

test('authoritative Play packet separates microphone permission from current audio collection and locks re-file gate', () => {
  assert.match(playPacket, /RECORD_AUDIO/);
  assert.match(playPacket, /CALLER_CLOSED_BETA_ENABLED=false/);
  assert.match(playPacket, /COMMERCIAL_HOSTING_APPROVED=false/);
  assert.match(playPacket, /34161228428/);
  assert.match(playPacket, /34161306558/);
  assert.match(playPacket, /Audio files \/ Voice or sound recordings/);
  assert.match(playPacket, /Collected: \*\*No\*\*/);
  assert.match(playPacket, /Shared: \*\*No\*\*/);
  assert.match(playPacket, /Microphone permission: \*\*Yes\*\*/);
  assert.match(playPacket, /Before `CALLER_CLOSED_BETA_ENABLED`/);
  assert.match(playPacket, /update Privacy and Store disclosures \*\*before\*\* enabling the feature/);
});
