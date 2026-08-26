import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCallAuthorization } from '../services/api/src/domain/call-authorization.ts';

test('one minute at locked Iran caller rate reserves exactly 31000 IRR', () => {
  const result = computeCallAuthorization({
    balanceMinor: 31_000n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 31_000n,
    billingIncrementSeconds: 1,
  });
  assert.deepEqual(result, { authorizedMinor: 31_000n, maxBillableSeconds: 60 });
});

test('existing reservations reduce available call time', () => {
  const result = computeCallAuthorization({
    balanceMinor: 62_000n,
    reservedMinor: 31_000n,
    callerRatePerMinuteMinor: 31_000n,
    billingIncrementSeconds: 1,
  });
  assert.deepEqual(result, { authorizedMinor: 31_000n, maxBillableSeconds: 60 });
});

test('requested max seconds caps authorization without over-reserving', () => {
  const result = computeCallAuthorization({
    balanceMinor: 100_000n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 31_000n,
    billingIncrementSeconds: 1,
    requestedMaxSeconds: 90,
  });
  assert.deepEqual(result, { authorizedMinor: 46_500n, maxBillableSeconds: 90 });
});

test('billing increment rounds maximum duration down to a safe whole increment', () => {
  const result = computeCallAuthorization({
    balanceMinor: 31_000n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 31_000n,
    billingIncrementSeconds: 30,
    requestedMaxSeconds: 50,
  });
  assert.deepEqual(result, { authorizedMinor: 15_500n, maxBillableSeconds: 30 });
});

test('insufficient balance for one billing increment returns null', () => {
  const result = computeCallAuthorization({
    balanceMinor: 516n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 31_000n,
    billingIncrementSeconds: 1,
  });
  assert.equal(result, null);
});
