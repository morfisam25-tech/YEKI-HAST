import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const entrypoint = await readFile(new URL('../apps/mobile/index.js', import.meta.url), 'utf8');
const root = await readFile(new URL('../apps/mobile/RootApp.tsx', import.meta.url), 'utf8');
const lightweightBootstrap = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');
const canonicalBootstrap = await readFile(new URL('../services/api/src/routes/bootstrap.ts', import.meta.url), 'utf8');

test('mobile entrypoint uses the public-release wrapper', () => {
  assert.match(entrypoint, /import RootApp from '\.\/RootApp'/);
  assert.match(entrypoint, /registerRootComponent\(RootApp\)/);
});

test('mobile exposes discoverable policy, account deletion and support actions from bootstrap', () => {
  assert.match(root, /getBootstrap\(\)/);
  assert.match(root, /privacyPolicyUrl/);
  assert.match(root, /termsOfServiceUrl/);
  assert.match(root, /accountDeletionUrl/);
  assert.match(root, /childSafetyUrl/);
  assert.match(root, /supportEmail/);
  assert.match(root, />حذف حساب</);
  assert.match(root, />حریم خصوصی</);
  assert.match(root, />قوانین استفاده</);
  assert.match(root, />پشتیبانی</);
  assert.match(root, />ایمنی کودک</);
});

test('mobile states the human-listening service boundary without inventing a hotline', () => {
  assert.match(root, /جایگزین درمان، مشاوره تخصصی یا خدمات اضطراری نیست/);
  assert.match(root, /خدمات اضطراری محل زندگی خود/);
  assert.doesNotMatch(root, /\b(?:110|115|123|911|988)\b/);
});

for (const [name, source] of [['lightweight', lightweightBootstrap], ['canonical', canonicalBootstrap]] as const) {
  test(`${name} bootstrap supplies the shared legal configuration`, () => {
    assert.match(source, /getPublicReleaseConfig/);
    assert.match(source, /legal:\s*getPublicReleaseConfig\(\)/);
  });
}
