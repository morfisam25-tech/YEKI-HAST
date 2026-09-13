import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  decryptPrivateText,
  encryptPrivateText,
  normalizeIranMobile,
} from '../services/api/src/lib/security.ts';

process.env.ACTIVE_DATA_ENCRYPTION_KEY_ID = 'test-key';
process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({
  'test-key': randomBytes(32).toString('base64'),
});

test('private encryption binds ciphertext to AAD and embeds key id', () => {
  const encrypted = encryptPrivateText('+989121234567', 'user_contacts:phone:user-1');
  assert.match(encrypted, /^v1\.test-key\./);
  assert.equal(decryptPrivateText(encrypted, 'user_contacts:phone:user-1'), '+989121234567');
  assert.throws(() => decryptPrivateText(encrypted, 'user_contacts:phone:user-2'));
});

test('Iran mobile normalization accepts supported user formats', () => {
  assert.equal(normalizeIranMobile('09123456789'), '+989123456789');
  assert.equal(normalizeIranMobile('989123456789'), '+989123456789');
  assert.equal(normalizeIranMobile('+989123456789'), '+989123456789');
  assert.equal(normalizeIranMobile('00989123456789'), '+989123456789');
  assert.equal(normalizeIranMobile('0912 345 6789'), '+989123456789');
});

test('Iran mobile normalization rejects malformed or unsupported numbers', () => {
  for (const value of [
    '02112345678',
    '+12025550123',
    '+981212345678',
    '08123456789',
    '0912345678',
    '091234567890',
    'not-a-phone',
  ]) {
    assert.throws(() => normalizeIranMobile(value), /invalid_iran_mobile/);
  }
});
