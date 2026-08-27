import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../services/api/src/routes/admin-payments.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/payments/page.tsx', import.meta.url), 'utf8');
const payments = await readFile(new URL('../services/api/src/routes/payments.ts', import.meta.url), 'utf8');

test('admin payments flag only stale pending attempts without a provider token', () => {
  assert.match(backend, /INITIALIZATION_AMBIGUOUS_MINUTES = 5/);
  assert.match(backend, /status::text='pending'/);
  assert.match(backend, /provider_payment_id IS NULL/);
  assert.match(backend, /initializationAmbiguous/);
});

test('provider payment identifiers remain private in admin monitoring', () => {
  assert.match(backend, /providerReferencePresent: Boolean\(row\.provider_payment_id\)/);
  assert.match(backend, /providerReferenceIncluded: false/);
  assert.doesNotMatch(backend, /providerPaymentReference:\s*row\.provider_payment_id/);
  assert.doesNotMatch(page, /providerPaymentReference/);
});

test('ambiguous initialization UI forbids manual credit and blind recreation', () => {
  assert.match(page, /INITIALIZATION AMBIGUOUS/);
  assert.match(page, /دستی credit نکن/);
  assert.match(page, /idempotency key/);
  assert.doesNotMatch(page, /manual credit|creditWallet|forceSuccess/i);
});

test('payment creation keeps ambiguous provider failures pending and only terminals explicit token rejection', () => {
  assert.match(payments, /provider\.createPayment/);
  assert.match(payments, /payment_initializing/);
  assert.match(payments, /payment_token_initialization_ambiguous/);
  assert.match(payments, /error\.code === 'payment_token_failed'/);
  assert.match(payments, /error\.providerCode !== null/);
  assert.match(payments, /if \(definitiveTokenFailure\) \{[\s\S]*SET status='failed'/);
  assert.doesNotMatch(payments, /catch \(error\) \{\s*await query\([\s\S]*SET status='failed'/);
});
