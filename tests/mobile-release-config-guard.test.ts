import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appConfig = JSON.parse(await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'));
const easConfig = JSON.parse(await readFile(new URL('../apps/mobile/eas.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));

const productionApiOrigin = 'https://yeki-hast-theta.vercel.app';
const sdk57Node = '22.23.1';

test('mobile app has stable Android and iOS application identifiers', () => {
  assert.equal(appConfig.expo.android.package, 'app.yekihast.mobile');
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'app.yekihast.mobile');
});

test('mobile preview build is internally distributable, explicit and uses production API origin', () => {
  assert.equal(easConfig.build.preview.distribution, 'internal');
  assert.equal(easConfig.build.preview.environment, 'preview');
  assert.equal(easConfig.build.preview.node, sdk57Node);
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_API_BASE_URL, productionApiOrigin);
});

test('mobile production build is reproducible enough for store beta versioning', () => {
  assert.equal(easConfig.cli.requireCommit, true);
  assert.equal(easConfig.cli.appVersionSource, 'remote');
  assert.equal(easConfig.build.production.environment, 'production');
  assert.equal(easConfig.build.production.node, sdk57Node);
  assert.equal(easConfig.build.production.autoIncrement, true);
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
