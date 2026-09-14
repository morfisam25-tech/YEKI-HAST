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
const currentRelease = await readFile(new URL('../docs/STORE_RELEASE_CURRENT.md', import.meta.url), 'utf8');
const platformRequirements = await readFile(new URL('../docs/STORE_PLATFORM_REQUIREMENTS.md', import.meta.url), 'utf8');

const allMobileDeps = { ...(mobilePackage.dependencies ?? {}), ...(mobilePackage.devDependencies ?? {}) };
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

test('privacy policy covers the public 18+ human-listening and live WebRTC runtime', () => {
  for (const marker of [
    'وب و اپ موبایل', '۱۸ سال و بالاتر', 'شنونده انسانی', 'نام مستعار', 'زبان‌های خوداظهاری',
    'معرفی کوتاه', 'SecureStore', 'WebRTC', 'TURN',
    // W58: recording is ON, access is limited/audited, not "off".
    'ضبط و به‌صورت امن نگهداری می‌کند', 'دسترسی فقط برای بررسی شکایت یا ایمنی', 'دوره‌های نهایی',
  ]) assert.match(privacyPage, new RegExp(marker));
});

test('account deletion is discoverable and distinguishes deletion from retained-record review', () => {
  assert.match(mobileRoot, />حذف حساب</);
  assert.match(mobileRoot, /accountDeletionUrl/);
  assert.match(deletionPage, /\/api\/account\/deletion-request/);
  assert.match(deletionPage, /payload\.deletionCompleted \? 'completed' : 'requested'/);
  assert.match(deletionPage, /حساب حذف شد/);
  assert.match(deletionPage, /نشست‌ها فوراً باطل می‌شوند/);
});

test('current mobile package has no known analytics or advertising SDK', () => {
  for (const dependency of analyticsOrAdsPackages) assert.equal(allMobileDeps[dependency], undefined);
});

test('release documents record W32 Play reality and prohibit stale upload claims', () => {
  assert.match(currentRelease, /Draft/);
  for (const source of [currentRelease, playPacket]) {
    assert.match(source, /zero testers|zero configured testers|zero/);
    assert.match(source, /14-day.*not started|14-day clock has not started/);
    assert.match(source, /vc7/);
    assert.match(source, /8 or higher|8\+/);
  }
  assert.match(currentRelease, /Uploaded AAB: \*\*none\*\*/);
  assert.match(currentRelease, /Data Safety: \*\*not started\*\*/);
  assert.match(currentRelease, /Child safety declaration: \*\*not started\*\*/);
  assert.match(currentRelease, /app icon, feature graphic, and phone screenshots in Console: \*\*missing\*\*/i);
});

test('store answers remain explicitly unsubmitted and require exact future-binary review', () => {
  assert.match(submissionPacket, /unsubmitted draft/i);
  assert.match(submissionPacket, /No answer in this file has been filed/);
  assert.match(submissionPacket, /exact future AAB/);
  assert.match(submissionPacket, /Microphone permission: \*\*Yes\*\*/);
  // W58: platform recording is locked product policy ON at public launch, not off.
  assert.match(submissionPacket, /Platform recording \(W58, source-only[^)]*\): \*\*On at public launch\*\*/);
  assert.doesNotMatch(submissionPacket, /Platform recording: \*\*Off\*\*/);
  assert.match(submissionPacket, /written confirmation is still required/i);
});
