import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  '../services/api/src/routes/admin-payouts.ts',
  '../services/api/src/routes/admin-safety.ts',
  '../services/api/src/routes/admin-calls.ts',
];

const sources = await Promise.all(
  files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
);

const combined = sources.join('\n');

test('admin operations queues never decrypt private data', () => {
  assert.doesNotMatch(combined, /decryptPrivateText/);
});

test('admin operations queues do not select encrypted identity or bank payloads', () => {
  assert.doesNotMatch(combined, /phone_e164_ciphertext/);
  assert.doesNotMatch(combined, /national_id_ciphertext/);
  assert.doesNotMatch(combined, /bank_iban_ciphertext/);
  assert.doesNotMatch(combined, /bank_account_holder_ciphertext/);
});

test('admin calls queue does not expose telephony bridge identifiers', () => {
  const calls = sources[2];
  assert.doesNotMatch(calls, /provider_bridge_id/);
});

test('admin safety queue does not read encrypted report or safety detail bodies', () => {
  const safety = sources[1];
  assert.doesNotMatch(safety, /private_data\.report_details/);
  assert.doesNotMatch(safety, /private_data\.safety_event_details/);
  assert.doesNotMatch(safety, /details_ciphertext/);
});
