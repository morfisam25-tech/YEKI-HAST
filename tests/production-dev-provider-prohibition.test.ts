import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const smsSource = await readFile(new URL('../services/api/src/providers/sms.ts', import.meta.url), 'utf8');
const telephonySource = await readFile(new URL('../services/api/src/providers/telephony.ts', import.meta.url), 'utf8');

test('development SMS provider is impossible in production and never logs OTPs', () => {
  assert.match(smsSource, /if \(provider === 'dev'\)/);
  assert.match(smsSource, /process\.env\.NODE_ENV !== 'development'/);
  assert.match(smsSource, /sms_provider_not_configured/);
  assert.doesNotMatch(smsSource, /console\.log\([^\n]*code/i);
  assert.doesNotMatch(smsSource, /console\.error\([^\n]*code/i);
});

test('SMS.ir production use requires explicit approved template acknowledgement', () => {
  assert.match(smsSource, /SMSIR_OTP_TEMPLATE_APPROVED/);
  assert.match(smsSource, /process\.env\.NODE_ENV === 'production'/);
  assert.match(smsSource, /!== 'true'/);
});

test('telephony has no implemented production adapter and dev adapter is forbidden in production', () => {
  assert.match(telephonySource, /provider === 'dev'/);
  assert.match(telephonySource, /process\.env\.NODE_ENV === 'production'/);
  assert.match(telephonySource, /dev telephony provider is forbidden in production/);
  assert.match(telephonySource, /Telephony provider not implemented/);
});
