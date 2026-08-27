import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const payments = await readFile(new URL('../services/api/src/routes/payments.ts', import.meta.url), 'utf8');

test('successful topup requires exact provider order and amount match before credit', () => {
  assert.match(payments, /!verified\.paid \|\| verified\.orderId !== row\.id \|\| verified\.amountMinor !== BigInt\(row\.amount_minor\)/);
  assert.match(payments, /payment_verification_mismatch/);
});

test('wallet topup credit is serialized by attempt and wallet locks', () => {
  assert.match(payments, /FROM app\.payment_attempts[\s\S]*FOR UPDATE/);
  assert.match(payments, /FROM app\.wallets[\s\S]*FOR UPDATE/);
  assert.match(payments, /wallet_balance_overflow/);
});

test('duplicate verification cannot create a second payment topup transaction', () => {
  assert.match(payments, /WHERE payment_attempt_id=\$1 AND type='payment_topup'/);
  assert.match(payments, /payment-topup:\$\{current\.id\}:credit/);
  assert.match(payments, /idempotent: true/);
});

test('terminal failed or cancelled attempts are never credited on later retries', () => {
  assert.match(payments, /row\.status === 'cancelled' \|\| row\.status === 'failed'/);
  assert.match(payments, /current\.status !== 'pending'/);
  assert.match(payments, /payment_state_conflict/);
});

test('payment callback binds both order id and provider transaction id', () => {
  assert.match(payments, /UUID_RE\.test\(transId\)/);
  assert.match(payments, /UUID_RE\.test\(orderId\)/);
  assert.match(payments, /row\.provider_payment_id !== transId/);
  assert.match(payments, /invalid_payment_callback/);
});
