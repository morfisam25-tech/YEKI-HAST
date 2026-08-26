import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIranPhone } from '../apps/mobile/src/api.ts';

test('Iran local mobile becomes E.164', () => {
  assert.equal(normalizeIranPhone('0912 123 4567'), '+989121234567');
});

test('Iran E.164 remains unchanged', () => {
  assert.equal(normalizeIranPhone('+989121234567'), '+989121234567');
});

test('invalid phone is rejected', () => {
  assert.throws(() => normalizeIranPhone('0912'));
});
