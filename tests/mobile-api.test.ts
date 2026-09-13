import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeIranPhone } from '../apps/mobile/src/api.ts';

const source = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');

test('mobile API keeps an explicit override and current production fallback', () => {
  assert.match(source, /process\.env\.EXPO_PUBLIC_API_BASE_URL/);
  assert.match(source, /https:\/\/yeki-hast-unique-6ff0\.vercel\.app/);
  assert.doesNotMatch(source, /https:\/\/yeki-hast-theta\.vercel\.app/);
  assert.doesNotMatch(source, /https:\/\/yeki-hast\.vercel\.app/);
});

test('Iran local mobile becomes E.164', () => {
  assert.equal(normalizeIranPhone('0912 123 4567'), '+989121234567');
});

test('Iran E.164 remains unchanged', () => {
  assert.equal(normalizeIranPhone('+989121234567'), '+989121234567');
});

test('invalid phone is rejected', () => {
  assert.throws(() => normalizeIranPhone('0912'));
});
