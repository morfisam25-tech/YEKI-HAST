import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'));
const easConfig = JSON.parse(await readFile(new URL('../apps/mobile/eas.json', import.meta.url), 'utf8'));

const productionApiOrigin = 'https://yeki-hast-theta.vercel.app';

test('mobile app has stable Android and iOS application identifiers', () => {
  assert.equal(appConfig.expo.android.package, 'app.yekihast.mobile');
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'app.yekihast.mobile');
});

test('mobile preview build is internally distributable and uses production API origin', () => {
  assert.equal(easConfig.build.preview.distribution, 'internal');
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_API_BASE_URL, productionApiOrigin);
});

test('mobile production build and submission profiles exist without embedded secrets', () => {
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_API_BASE_URL, productionApiOrigin);
  assert.deepEqual(easConfig.submit.production, {});

  const serialized = JSON.stringify(easConfig);
  assert.doesNotMatch(serialized, /DATABASE_URL|SMTP_PASSWORD|API_KEY|PAYOUT_AUTH|DATA_ENCRYPTION_KEYS|HASH_PEPPER/);
});

test('development client profile is not declared without expo-dev-client dependency', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.dependencies?.['expo-dev-client'], undefined);
  assert.equal(easConfig.build.development, undefined);
});
