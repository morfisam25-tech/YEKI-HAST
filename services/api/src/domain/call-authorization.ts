export type CallAuthorization = {
  authorizedMinor: bigint;
  maxBillableSeconds: number;
};

export function computeCallAuthorization(input: {
  balanceMinor: bigint;
  reservedMinor: bigint;
  callerRatePerMinuteMinor: bigint;
  billingIncrementSeconds: number;
  requestedMaxSeconds?: number | null;
}): CallAuthorization | null {
  const {
    balanceMinor,
    reservedMinor,
    callerRatePerMinuteMinor,
    billingIncrementSeconds,
    requestedMaxSeconds = null,
  } = input;

  if (balanceMinor < 0n || reservedMinor < 0n || reservedMinor > balanceMinor) {
    throw new Error('wallet balance invariant violated');
  }
  if (callerRatePerMinuteMinor <= 0n) throw new Error('caller rate must be positive');
  if (!Number.isInteger(billingIncrementSeconds) || billingIncrementSeconds < 1 || billingIncrementSeconds > 60) {
    throw new Error('billing increment invalid');
  }
  if (requestedMaxSeconds !== null && (!Number.isInteger(requestedMaxSeconds) || requestedMaxSeconds < 1)) {
    throw new Error('requested max seconds invalid');
  }

  const available = balanceMinor - reservedMinor;
  const increment = BigInt(billingIncrementSeconds);

  if (requestedMaxSeconds !== null) {
    const requested = BigInt(requestedMaxSeconds);
    const requestedRoundedDown = (requested / increment) * increment;
    if (requestedRoundedDown < increment) return null;

    // A selected session cap is a wallet HOLD, not a request to silently shorten the
    // session to whatever the current balance happens to afford. If the full selected
    // cap cannot be reserved, the caller must top up or choose a smaller preset.
    const authorizedMinor = (callerRatePerMinuteMinor * requestedRoundedDown + 59n) / 60n;
    if (authorizedMinor > available) return null;
    if (requestedRoundedDown > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('billable limit overflow');
    return {
      authorizedMinor,
      maxBillableSeconds: Number(requestedRoundedDown),
    };
  }

  let maxBillable = (available * 60n) / callerRatePerMinuteMinor;
  maxBillable = (maxBillable / increment) * increment;
  if (maxBillable < increment) return null;
  const authorizedMinor = (callerRatePerMinuteMinor * maxBillable + 59n) / 60n;
  if (authorizedMinor > available) return null;
  if (maxBillable > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('billable limit overflow');

  return {
    authorizedMinor,
    maxBillableSeconds: Number(maxBillable),
  };
}
