import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appConfig = await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8');
const easConfig = await readFile(new URL('../apps/mobile/eas.json', import.meta.url), 'utf8');
const mobilePackage = await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8');
const env = await readFile(new URL('../apps/mobile/src/env.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const wallet = await readFile(new URL('../apps/mobile/src/CallerWalletCard.tsx', import.meta.url), 'utf8');
const caller = (await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const listener = (await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const realtimeMedia = await readFile(new URL('../apps/mobile/src/realtime-media.ts', import.meta.url), 'utf8');
const rootApp = await readFile(new URL('../apps/mobile/RootApp.tsx', import.meta.url), 'utf8');
const training = await readFile(new URL('../apps/mobile/src/ListenerTrainingScreen.tsx', import.meta.url), 'utf8');

test('W86: Android identity stays locked (package, versionCode) and targetSdk 36 is proven via expo-build-properties', () => {
  assert.match(appConfig, /"package": "app\.yekihast\.mobile"/);
  assert.match(appConfig, /"versionCode": 9/);
  assert.match(appConfig, /"expo-build-properties"[\s\S]*"targetSdkVersion": 36/);
  assert.match(appConfig, /"expo-build-properties"[\s\S]*"compileSdkVersion": 36/);
  assert.match(mobilePackage, /"expo-build-properties": "~57\.0\.21"/);
});

// W89: the plugin and its two app.json hooks are what make a real Gradle build
// succeed and keep the merged manifest audio-only. Nothing asserted them
// before, which is how W89 initially inherited a tree without the plugin.
test('W86/W89: the RealtimeKit Android compatibility plugin is registered and location permissions stay blocked', async () => {
  const plugin = await readFile(new URL('../apps/mobile/plugins/withRealtimeKitAndroidCompat.js', import.meta.url), 'utf8');
  assert.match(plugin, /blob_provider_authority/);
  assert.match(plugin, /android\.hardware\.camera/);
  assert.match(plugin, /'android:required': 'false'/);
  assert.match(plugin, /'tools:node': 'replace'/);

  const config = JSON.parse(appConfig);
  assert.ok(
    config.expo.plugins.includes('./plugins/withRealtimeKitAndroidCompat'),
    'the compatibility plugin must be registered or a real Gradle build fails on the undefined blob_provider_authority string',
  );
  for (const permission of ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION']) {
    assert.ok(
      config.expo.android.blockedPermissions.includes(permission),
      permission + ' must stay blocked: the RealtimeKit library manifest would otherwise merge it into this audio-only app',
    );
  }
});

test('W86: eas.json adds a store-distribution app-bundle Closed-Test profile that never hardcodes the Production API', () => {
  assert.match(easConfig, /"closedTest"[\s\S]*"distribution": "store"/);
  assert.match(easConfig, /"closedTest"[\s\S]*"buildType": "app-bundle"/);
  assert.match(easConfig, /"closedTest"[\s\S]*"EXPO_PUBLIC_APP_ENV": "closed_test"/);
  const closedTestBlock = easConfig.slice(easConfig.indexOf('"closedTest"'), easConfig.indexOf('"production"'));
  assert.doesNotMatch(closedTestBlock, /EXPO_PUBLIC_API_BASE_URL/);
  assert.doesNotMatch(closedTestBlock, /yeki-hast-unique-6ff0\.vercel\.app/);
});

test('W86: closed_test is a distinct, fail-closed AppEnv that never falls back to the Production API origin', () => {
  assert.match(env, /export type AppEnv = 'production' \| 'preview_internal_beta' \| 'closed_test' \| 'local'/);
  assert.match(env, /const KNOWN_APP_ENVS: readonly AppEnv\[\] = \['production', 'preview_internal_beta', 'closed_test', 'local'\]/);
  assert.match(api, /env === 'preview_internal_beta' \|\| env === 'closed_test'/);
  assert.match(api, /EXPO_PUBLIC_API_BASE_URL is required in \$\{env\}/);
  assert.match(api, /must not point at the Production API origin in \$\{env\}/);
});

test('W86: payment is hardcoded disabled for closed_test builds with no override flag', () => {
  assert.match(env, /export function isPaymentEnabled\(\): boolean \{\s*return resolveAppEnv\(\) !== 'closed_test';\s*\}/);
});

test('W86: the wallet top-up UI is fully gated behind isPaymentEnabled() -- no live checkout can render or be triggered in Closed Test', () => {
  assert.match(wallet, /import \{ isPaymentEnabled \} from '\.\/env\.ts'/);
  assert.match(wallet, /const PAYMENT_ENABLED = isPaymentEnabled\(\);/);
  assert.match(wallet, /if \(busy \|\| !PAYMENT_ENABLED\) return;/);
  assert.match(wallet, /\{PAYMENT_ENABLED \? \(/);
  assert.match(wallet, /شارژ واقعی کیف پول در این نسخه آزمایشی \(Closed Test\) غیرفعال است/);
  // The gate must wrap the actual createWalletTopup()/Linking.openURL() call site.
  const gateStart = wallet.indexOf('async function startTopup');
  const gateEnd = wallet.indexOf('async function checkPayment');
  const startTopupBody = wallet.slice(gateStart, gateEnd);
  assert.ok(startTopupBody.indexOf('!PAYMENT_ENABLED') < startTopupBody.indexOf('createWalletTopup'));
});

test('W86: microphone permission-denied and microphone-unavailable are classified and surfaced distinctly from a network error on both Caller and Listener', () => {
  assert.match(realtimeMedia, /export function classifyMicrophoneError/);
  assert.match(realtimeMedia, /'microphone_permission_denied'/);
  assert.match(realtimeMedia, /'microphone_unavailable'/);

  for (const screen of [caller, listener]) {
    assert.match(screen, /classifyMicrophoneError/);
    assert.match(screen, /throw new Error\(classifyMicrophoneError\(cause\)\)/);
    assert.match(screen, /microphone_permission_denied: 'دسترسی به میکروفون رد شد/);
    assert.match(screen, /microphone_unavailable: 'میکروفون در دسترس نیست/);
  }
  // Caller's startCall() catch must resolve the mic-specific code before
  // falling through to the generic network/API error mapping.
  const startCallCatch = caller.match(/async function startCall[\s\S]*?\n  \}\n/)?.[0] ?? '';
  assert.match(startCallCatch, /microphone_permission_denied' \|\| cause\.message === 'microphone_unavailable'/);
  // Listener's answerInternetCall() catch must do the same.
  const answerCatch = listener.match(/async function answerInternetCall[\s\S]*?\n  \}\n/)?.[0] ?? '';
  assert.match(answerCatch, /microphone_permission_denied' \|\| cause\.message === 'microphone_unavailable'/);
});

test('W86: no generic/unconditional identity-verification claim exists -- training-screen copy only describes exam-gated eligibility for the KYC stage', () => {
  assert.doesNotMatch(caller, /هویت (شما |)تأیید شد/);
  assert.doesNotMatch(listener, /هویت (شما |)تأیید شد/);
  assert.match(training, /احراز هویت برای این درخواست آماده است/);
  assert.doesNotMatch(training, /هویت (شما |)تأیید شد/);
});

test('W86: legal footer (Privacy/Terms/Account Deletion/Child Safety/Support) is reachable from every screen and makes no "immediate deletion" claim', () => {
  assert.match(rootApp, /legal\?\.privacyPolicyUrl/);
  assert.match(rootApp, /legal\?\.termsOfServiceUrl/);
  assert.match(rootApp, /legal\?\.accountDeletionUrl/);
  assert.match(rootApp, /legal\?\.childSafetyUrl/);
  assert.match(rootApp, /حذف حساب/);
  assert.doesNotMatch(rootApp, /فوراً حذف|بلافاصله حذف|immediately delete/i);
});

test('W86: no foreground service surface was added -- mission C requires it be introduced only if actually needed', () => {
  for (const source of [caller, listener, realtimeMedia]) {
    assert.doesNotMatch(source, /FOREGROUND_SERVICE/);
    assert.doesNotMatch(source, /notifee/i);
  }
  assert.doesNotMatch(appConfig, /FOREGROUND_SERVICE/);
});
