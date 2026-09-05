import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repo = process.cwd();
const appJsonPath = resolve(repo, 'apps/mobile/app.json');
const mobilePackagePath = resolve(repo, 'apps/mobile/package.json');
const generatorPath = resolve(repo, 'apps/mobile/scripts/generate-artwork.mjs');
const assetsDir = resolve(repo, 'apps/mobile/assets/generated');

function pngSize(path: string) {
  const file = readFileSync(path);
  assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

test('mobile Store artwork is deterministic, generated before EAS, and wired into Expo config', () => {
  const appConfig = JSON.parse(readFileSync(appJsonPath, 'utf8')).expo;
  const mobilePackage = JSON.parse(readFileSync(mobilePackagePath, 'utf8'));

  assert.equal(appConfig.icon, './assets/generated/app-icon.png');
  assert.equal(appConfig.ios.icon, './assets/generated/app-icon.png');
  assert.equal(appConfig.android.icon, './assets/generated/app-icon.png');
  assert.equal(appConfig.android.adaptiveIcon.foregroundImage, './assets/generated/android-adaptive-foreground.png');
  assert.equal(appConfig.android.adaptiveIcon.monochromeImage, './assets/generated/android-monochrome.png');
  assert.equal(appConfig.android.adaptiveIcon.backgroundColor, '#0B0B0B');

  assert.equal(mobilePackage.scripts['generate:artwork'], 'node scripts/generate-artwork.mjs');
  assert.equal(mobilePackage.scripts['eas-build-pre-install'], 'node scripts/generate-artwork.mjs');
  assert.match(mobilePackage.scripts['export:android'], /generate:artwork/);
  assert.match(mobilePackage.scripts['export:ios'], /generate:artwork/);

  execFileSync(process.execPath, [generatorPath], { cwd: repo, stdio: 'pipe' });

  const expected = [
    ['app-icon.png', 1024],
    ['android-adaptive-foreground.png', 1024],
    ['android-monochrome.png', 1024],
    ['play-store-icon.png', 512],
  ] as const;

  for (const [name, dimension] of expected) {
    const path = resolve(assetsDir, name);
    assert.ok(existsSync(path), `${name} must be generated`);
    assert.deepEqual(pngSize(path), { width: dimension, height: dimension });
  }
});
