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

test('ambiguous initialization UI forbids crediting that attempt or blindly recreating it', () => {
  assert.match(page, /INITIALIZATION AMBIGUOUS/);
  assert.match(page, /دستی credit نکن/);
  assert.match(page, /idempotency key/);
  assert.doesNotMatch(page, /forceSuccess/i);

  const creditOperation = backend.slice(backend.indexOf('export async function createAdminWalletCreditWithDependencies'));
  assert.match(creditOperation, /applyInternalBetaAdminCredit/);
  assert.doesNotMatch(creditOperation, /paymentAttemptId|payment_attempt_id|verifyAndFinalizeAttempt/);
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

test('ambiguous token recovery verifies callback before binding provider id or crediting', () => {
  assert.match(payments, /verifyAndFinalizeAttempt\(row, transId\)/);
  assert.match(payments, /const callbackRecovery = row\.provider_payment_id === null && candidateProviderPaymentId === providerPaymentId/);
  assert.match(payments, /callbackRecovery && disposition !== 'succeeded'[\s\S]*return \{ status: 'pending'/);
  assert.match(payments, /verified\.orderId !== row\.id \|\| verified\.amountMinor !== BigInt\(row\.amount_minor\)/);

  const verificationIndex = payments.indexOf("verified.orderId !== row.id || verified.amountMinor !== BigInt(row.amount_minor)");
  const bindIndex = payments.indexOf('SET provider_payment_id=$2', verificationIndex);
  const creditIndex = payments.indexOf("VALUES ($1,$2,'payment_topup'", bindIndex);
  assert.ok(verificationIndex >= 0, 'exact provider verification guard must exist');
  assert.ok(bindIndex > verificationIndex, 'provider id must bind only after exact verification');
  assert.ok(creditIndex > bindIndex, 'wallet credit must happen only after provider id is bound');

  assert.match(payments, /WHERE id=\$1 AND status='pending' AND provider_payment_id IS NULL[\s\S]*RETURNING provider_payment_id/);
  assert.match(payments, /row\.provider_payment_id && row\.provider_payment_id !== transId/);
  assert.doesNotMatch(payments, /nextPayCallback[\s\S]*provider\.createPayment/);
});
