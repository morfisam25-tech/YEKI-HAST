import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maxBillableSecondsFromAvailableMinor,
  previewCallSettlement,
  previewCallSettlementBigInt,
  proratedMinorUnits,
  proratedMinorUnitsBigInt,
  roundBillableSeconds,
} from '../packages/domain/src/billing.ts';

test('Iran beta: one connected hour settles to locked baseline', () => {
  assert.deepEqual(previewCallSettlement(31_000, 21_000, 3_600, 1), {
    billableSeconds: 3_600,
    callerChargeMinor: 1_860_000,
    listenerEarningMinor: 1_260_000,
    platformGrossSpreadMinor: 600_000,
  });
});

test('Iran beta: 90 seconds settles exactly per-second', () => {
  assert.deepEqual(previewCallSettlement(31_000, 21_000, 90, 1), {
    billableSeconds: 90,
    callerChargeMinor: 46_500,
    listenerEarningMinor: 31_500,
    platformGrossSpreadMinor: 15_000,
  });
});

test('one-second increment is proportional to connected seconds, not whole minutes', () => {
  assert.equal(proratedMinorUnits(31_000, 630, 1, 'caller'), 325_500);
  assert.equal(roundBillableSeconds(630, 1), 630);
});

test('billing increment rounds seconds up before money calculation', () => {
  assert.equal(roundBillableSeconds(61, 60), 120);
  assert.equal(proratedMinorUnits(31_000, 61, 60, 'caller'), 62_000);
});

test('caller ceil and listener floor never create a negative platform spread', () => {
  for (let seconds = 0; seconds <= 7_200; seconds += 1) {
    const settlement = previewCallSettlement(31_000, 21_000, seconds, 1);
    assert.ok(settlement.platformGrossSpreadMinor >= 0, `negative spread at ${seconds}s`);
  }
});

test('wallet authorization derives maximum connected seconds', () => {
  assert.equal(maxBillableSecondsFromAvailableMinor(310_000, 31_000), 600);
});

test('bigint settlement preserves exact money arithmetic', () => {
  assert.deepEqual(previewCallSettlementBigInt(31_000n, 21_000n, 90, 1), {
    billableSeconds: 90,
    callerChargeMinor: 46_500n,
    listenerEarningMinor: 31_500n,
    platformGrossSpreadMinor: 15_000n,
  });
  assert.equal(proratedMinorUnitsBigInt(31_000n, 61, 60, 'caller'), 62_000n);
});

test('bigint settlement handles values above Number safe integer without precision loss', () => {
  const settlement = previewCallSettlementBigInt(9_007_199_254_740_993n, 1n, 60, 1);
  assert.equal(settlement.callerChargeMinor, 9_007_199_254_740_993n);
  assert.equal(settlement.listenerEarningMinor, 1n);
});
