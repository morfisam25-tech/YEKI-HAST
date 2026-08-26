import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { decryptPrivateText, encryptPrivateText } from '../services/api/src/lib/security.ts';

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
