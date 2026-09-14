import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCallAuthorization } from '../services/api/src/domain/call-authorization.ts';

test('one minute at locked Iran caller rate reserves exactly 40000 IRR', () => {
  const result = computeCallAuthorization({
    balanceMinor: 40_000n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 40_000n,
    billingIncrementSeconds: 1,
  });
  assert.deepEqual(result, { authorizedMinor: 40_000n, maxBillableSeconds: 60 });
});

test('existing reservations reduce available call time', () => {
  const result = computeCallAuthorization({
    balanceMinor: 80_000n,
    reservedMinor: 40_000n,
    callerRatePerMinuteMinor: 40_000n,
    billingIncrementSeconds: 1,
  });
  assert.deepEqual(result, { authorizedMinor: 40_000n, maxBillableSeconds: 60 });
});

test('requested max seconds caps authorization without over-reserving', () => {
  const result = computeCallAuthorization({
    balanceMinor: 100_000n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 40_000n,
    billingIncrementSeconds: 1,
    requestedMaxSeconds: 90,
  });
  assert.deepEqual(result, { authorizedMinor: 60_000n, maxBillableSeconds: 90 });
});

test('billing increment rounds maximum duration down to a safe whole increment', () => {
  const result = computeCallAuthorization({
    balanceMinor: 40_000n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 40_000n,
    billingIncrementSeconds: 30,
    requestedMaxSeconds: 50,
  });
  assert.deepEqual(result, { authorizedMinor: 20_000n, maxBillableSeconds: 30 });
});

test('insufficient balance for one billing increment returns null', () => {
  const result = computeCallAuthorization({
    balanceMinor: 666n,
    reservedMinor: 0n,
    callerRatePerMinuteMinor: 40_000n,
    billingIncrementSeconds: 1,
  });
  assert.equal(result, null);
});
