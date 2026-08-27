import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const payments = await readFile(new URL('../services/api/src/routes/payments.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../services/api/src/lib/payment-callback-page.ts', import.meta.url), 'utf8');

test('NextPay callback verifies exact provider callback before rendering browser result', () => {
  const callbackIndex = payments.indexOf('export async function nextPayCallback');
  const verifyIndex = payments.indexOf('verifyAndFinalizeAttempt(row, transId)', callbackIndex);
  const renderIndex = payments.indexOf('sendPaymentCallbackPage(res, outcome.status)', callbackIndex);
  assert.ok(callbackIndex >= 0 && verifyIndex > callbackIndex && renderIndex > verifyIndex);
  assert.match(payments, /row\.provider_payment_id && row\.provider_payment_id !== transId/);
  assert.match(payments, /!row\.provider_payment_id && row\.status !== 'pending'/);
});

test('browser callback page exposes only bounded status copy and no payment identifiers', () => {
  assert.match(page, /type CallbackStatus = 'pending' \| 'cancelled' \| 'failed' \| 'succeeded'/);
  assert.match(page, /content-type', 'text\/html; charset=utf-8'/);
  assert.match(page, /cache-control', 'no-store'/);
  assert.match(page, /x-content-type-options', 'nosniff'/);
  assert.doesNotMatch(page, /trans_id|order_id|providerPaymentId|provider_bridge|providerReference|attemptId|token|secret/i);
  assert.doesNotMatch(page, /window\.location|location\.href|meta http-equiv|deep-link|intent:\/\//i);
});

test('public wallet attempt no longer returns raw provider payment id', () => {
  const start = payments.indexOf('function publicAttempt');
  const end = payments.indexOf('function limitFrom', start);
  assert.ok(start >= 0 && end > start);
  const section = payments.slice(start, end);
  assert.doesNotMatch(section, /providerPaymentId\s*:/);
  assert.match(section, /paymentUrl:/);
});
