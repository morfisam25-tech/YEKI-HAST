export type BillingRounding = 'caller' | 'listener';

export function roundBillableSeconds(connectedSeconds: number, billingIncrementSeconds: number): number {
  if (!Number.isSafeInteger(connectedSeconds) || connectedSeconds < 0) {
    throw new Error('connectedSeconds must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(billingIncrementSeconds) || billingIncrementSeconds < 1 || billingIncrementSeconds > 60) {
    throw new Error('billingIncrementSeconds must be an integer between 1 and 60');
  }
  if (connectedSeconds === 0) return 0;
  return Math.ceil(connectedSeconds / billingIncrementSeconds) * billingIncrementSeconds;
}

export function proratedMinorUnits(
  ratePerMinuteMinor: number,
  connectedSeconds: number,
  billingIncrementSeconds: number,
  rounding: BillingRounding,
): number {
  if (!Number.isSafeInteger(ratePerMinuteMinor) || ratePerMinuteMinor < 0) {
    throw new Error('ratePerMinuteMinor must be a non-negative safe integer');
  }
  const billableSeconds = roundBillableSeconds(connectedSeconds, billingIncrementSeconds);
  const raw = (ratePerMinuteMinor * billableSeconds) / 60;
  return rounding === 'caller' ? Math.ceil(raw) : Math.floor(raw);
}

export interface CallSettlementPreview {
  billableSeconds: number;
  callerChargeMinor: number;
  listenerEarningMinor: number;
  platformGrossSpreadMinor: number;
}

export function previewCallSettlement(
  callerRatePerMinuteMinor: number,
  listenerRatePerMinuteMinor: number,
  connectedSeconds: number,
  billingIncrementSeconds = 1,
): CallSettlementPreview {
  if (listenerRatePerMinuteMinor > callerRatePerMinuteMinor) {
    throw new Error('listener rate cannot exceed caller rate');
  }
  const billableSeconds = roundBillableSeconds(connectedSeconds, billingIncrementSeconds);
  const callerChargeMinor = proratedMinorUnits(callerRatePerMinuteMinor, connectedSeconds, billingIncrementSeconds, 'caller');
  const listenerEarningMinor = proratedMinorUnits(listenerRatePerMinuteMinor, connectedSeconds, billingIncrementSeconds, 'listener');
  return {
    billableSeconds,
    callerChargeMinor,
    listenerEarningMinor,
    platformGrossSpreadMinor: callerChargeMinor - listenerEarningMinor,
  };
}

export function maxBillableSecondsFromAvailableMinor(
  availableMinor: number,
  callerRatePerMinuteMinor: number,
): number {
  if (!Number.isSafeInteger(availableMinor) || availableMinor < 0) throw new Error('availableMinor invalid');
  if (!Number.isSafeInteger(callerRatePerMinuteMinor) || callerRatePerMinuteMinor <= 0) throw new Error('caller rate invalid');
  return Math.floor((availableMinor * 60) / callerRatePerMinuteMinor);
}
