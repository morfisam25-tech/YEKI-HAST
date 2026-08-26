import assert from 'node:assert/strict';
import test from 'node:test';
import { nextPayVerificationDisposition } from '../services/api/src/domain/payment-status.ts';

test('NextPay success credits only on code 0', () => {
  assert.equal(nextPayVerificationDisposition(0), 'succeeded');
});

test('NextPay in-flight codes remain pending', () => {
  assert.equal(nextPayVerificationDisposition(-1), 'pending');
  assert.equal(nextPayVerificationDisposition(-3), 'pending');
});

test('NextPay cancellation stays distinct from failure', () => {
  assert.equal(nextPayVerificationDisposition(-4), 'cancelled');
});

test('NextPay rejection and provider errors fail closed', () => {
  assert.equal(nextPayVerificationDisposition(-2), 'failed');
  assert.equal(nextPayVerificationDisposition(-24), 'failed');
  assert.equal(nextPayVerificationDisposition(-72), 'failed');
});
