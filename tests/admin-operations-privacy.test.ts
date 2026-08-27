import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = {
  payouts: '../services/api/src/routes/admin-payouts.ts',
  safety: '../services/api/src/routes/admin-safety.ts',
  calls: '../services/api/src/routes/admin-calls.ts',
  payments: '../services/api/src/routes/admin-payments.ts',
};

const sources = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, file]) => [key, await readFile(new URL(file, import.meta.url), 'utf8')]),
)) as Record<keyof typeof paths, string>;

const combined = Object.values(sources).join('\n');

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
  assert.doesNotMatch(sources.calls, /provider_bridge_id/);
});

test('admin safety queue does not read encrypted report or safety detail bodies', () => {
  assert.doesNotMatch(sources.safety, /private_data\.report_details/);
  assert.doesNotMatch(sources.safety, /private_data\.safety_event_details/);
  assert.doesNotMatch(sources.safety, /details_ciphertext/);
});

test('admin payment queue excludes wallet internals and idempotency keys', () => {
  assert.doesNotMatch(sources.payments, /wallet_id/);
  assert.doesNotMatch(sources.payments, /idempotency_key/);
  assert.match(sources.payments, /walletDetailsIncluded: false/);
  assert.match(sources.payments, /idempotencyKeyIncluded: false/);
});
