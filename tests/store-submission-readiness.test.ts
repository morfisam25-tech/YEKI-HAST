import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'));
const mobilePackage = JSON.parse(await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));
const mobileRoot = await readFile(new URL('../apps/mobile/RootApp.tsx', import.meta.url), 'utf8');
const privacyPage = await readFile(new URL('../apps/web/app/privacy/page.tsx', import.meta.url), 'utf8');
const deletionPage = await readFile(new URL('../apps/web/app/account/delete/page.tsx', import.meta.url), 'utf8');
const submissionPacket = await readFile(new URL('../docs/STORE_SUBMISSION_ANSWERS.md', import.meta.url), 'utf8');
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

test('privacy policy explicitly covers current mobile listener beta data', () => {
  assert.match(privacyPage, /Web و اپ موبایل/);
  assert.match(privacyPage, /نام مستعار/);
  assert.match(privacyPage, /زبان‌ها و سطح تسلط/);
  assert.match(privacyPage, /معرفی کوتاه اختیاری/);
  assert.match(privacyPage, /SecureStore/);
  assert.match(privacyPage, /تماس صوتی Caller/);
});

test('account deletion is discoverable in app and initiable from the public web resource', () => {
  assert.match(mobileRoot, />حذف حساب</);
  assert.match(mobileRoot, /accountDeletionUrl/);
  assert.match(deletionPage, /\/api\/account\/deletion-request/);
  assert.match(deletionPage, /نشست‌های فعال همان لحظه باطل می‌شوند/);
  assert.match(deletionPage, /حذف حساب/);
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

test('store submission packet is pinned to real current identifiers and public policy surfaces', () => {
  assert.match(submissionPacket, /app\.yekihast\.mobile/);
  assert.match(submissionPacket, /https:\/\/web-unique-6ff0\.vercel\.app\/privacy/);
  assert.match(submissionPacket, /https:\/\/web-unique-6ff0\.vercel\.app\/account\/delete/);
  assert.match(submissionPacket, /Email-first Technical Beta/);
  assert.match(submissionPacket, /Caller voice, payment, KYC, payout, telephony/);
  assert.match(submissionPacket, /Google Play Data Safety/);
  assert.match(submissionPacket, /Apple App Privacy/);
});
