import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'));
const easConfig = JSON.parse(await readFile(new URL('../apps/mobile/eas.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));

const productionApiOrigin = 'https://yeki-hast-unique-6ff0.vercel.app';
const sdk57Node = '22.23.1';

test('mobile app has stable Android and iOS application identifiers', () => {
  assert.equal(appConfig.expo.android.package, 'app.yekihast.mobile');
  assert.equal(appConfig.expo.android.versionCode, 9);
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'app.yekihast.mobile');
});

test('first store release identity is explicit and phone-first', () => {
  assert.equal(appConfig.expo.name, 'یکی هست');
  assert.equal(appConfig.expo.slug, 'yeki-hast');
  assert.equal(appConfig.expo.version, '1.0.0');
  assert.equal(appConfig.expo.scheme, 'yekihast');
  assert.equal(appConfig.expo.orientation, 'portrait');
  assert.equal(appConfig.expo.ios.supportsTablet, false);
});

test('Expo project linkage is explicit but carries no account credential', () => {
  assert.equal(appConfig.expo.owner, 'saimorfis-team');
  assert.equal(appConfig.expo.extra?.eas?.projectId, '58b9f62d-db82-421a-ad59-edccac70c316');
  assert.doesNotMatch(JSON.stringify(appConfig), /EXPO_TOKEN|APPLE_ID|ASC_API_KEY|GOOGLE_SERVICE_ACCOUNT/);
});

test('Android app-data backup stays disabled for sensitive account and session data', () => {
  assert.equal(appConfig.expo.android.allowBackup, false);
  assert.equal(appConfig.expo.plugins?.[0]?.[0], 'expo-secure-store');
});

test('Android Store build keeps microphone and blocks unused sensitive permissions', () => {
  assert.deepEqual(appConfig.expo.android.permissions, ['android.permission.RECORD_AUDIO']);
  assert.deepEqual(
    appConfig.expo.android.blockedPermissions,
    [
      'android.permission.CAMERA',
      'android.permission.DUMP',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      // W86/W89: @cloudflare/realtimekit-react-native's manifest would otherwise
      // merge location permissions into this audio-only app.
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  );
  assert.ok(appConfig.expo.android.blockedPermissions.includes('android.permission.CAMERA'));
  assert.ok(!appConfig.expo.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
  assert.ok(!appConfig.expo.android.blockedPermissions.includes('android.permission.INTERNET'));
  assert.ok(!appConfig.expo.android.blockedPermissions.includes('android.permission.USE_BIOMETRIC'));
  assert.ok(!appConfig.expo.android.blockedPermissions.includes('android.permission.USE_FINGERPRINT'));
});

test('iOS export-compliance declaration matches the current SecureStore-only mobile crypto surface', () => {
  assert.equal(appConfig.expo.ios.config?.usesNonExemptEncryption, false);
  assert.ok(packageJson.dependencies?.['expo-secure-store']);
  assert.equal(packageJson.dependencies?.['expo-crypto'], undefined, 'adding expo-crypto requires export-compliance review');
});

test('mobile preview build is internally distributable, explicit, and never embeds the Production API origin', () => {
  assert.equal(easConfig.build.preview.distribution, 'internal');
  assert.equal(easConfig.build.preview.environment, 'preview');
  assert.equal(easConfig.build.preview.node, sdk57Node);
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_APP_ENV, 'preview_internal_beta');
  // W63 fix: Preview must never hardcode Production's API origin inline (it
  // silently pointed Internal Beta builds at Production before this branch).
  // The isolated Preview API origin must instead come from an EAS-hosted
  // environment variable scoped to the "preview" environment -- never a
  // literal in this file -- and apps/mobile/src/api.ts fails closed if it is
  // ever missing or if it is ever set to the Production origin.
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_API_BASE_URL, undefined);
  assert.doesNotMatch(JSON.stringify(easConfig.build.preview), new RegExp(productionApiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('mobile production build is reproducible enough for store beta versioning', () => {
  assert.equal(easConfig.cli.requireCommit, true);
  assert.equal(easConfig.cli.appVersionSource, 'local');
  assert.equal(easConfig.build.production.environment, 'production');
  assert.equal(easConfig.build.production.node, sdk57Node);
  assert.equal(easConfig.build.production.autoIncrement, undefined);
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_APP_ENV, 'production');
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_API_BASE_URL, productionApiOrigin);
  assert.equal(packageJson.engines.node, '22.x');
});

test('mobile production submission profile exists without embedded secrets', () => {
  assert.deepEqual(easConfig.submit.production, {});

  const serialized = JSON.stringify(easConfig);
  assert.doesNotMatch(serialized, /DATABASE_URL|SMTP_PASSWORD|API_KEY|PAYOUT_AUTH|DATA_ENCRYPTION_KEYS|HASH_PEPPER/);
});

test('development client profile is not declared without expo-dev-client dependency', () => {
  assert.equal(packageJson.dependencies?.['expo-dev-client'], undefined);
  assert.equal(easConfig.build.development, undefined);
});
