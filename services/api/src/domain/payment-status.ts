export type PaymentVerificationDisposition = 'succeeded' | 'pending' | 'cancelled' | 'failed';

/**
 * NextPay verification codes from the provider's official status table.
 *  0: completed successfully
 * -1: waiting for transaction continuation
 * -2: rejected by user or bank
 * -3: waiting for bank response
 * -4: cancelled
 * All other non-zero codes are treated as failures and never credit a wallet.
 */
export function nextPayVerificationDisposition(providerCode: number): PaymentVerificationDisposition {
  if (providerCode === 0) return 'succeeded';
  if (providerCode === -1 || providerCode === -3) return 'pending';
  if (providerCode === -4) return 'cancelled';
  return 'failed';
}

/**
 * Zibal only returns a successful verification result (100) after the payment
 * status is successful. The provider adapter (providers/payment.ts) maps any
 * other status to -1, which stays pending here and never credits a wallet.
 */
export function zibalVerificationDisposition(providerCode: number): PaymentVerificationDisposition {
  if (providerCode === 100) return 'succeeded';
  if (providerCode === -1) return 'pending';
  return 'failed';
}

export function paymentVerificationDisposition(provider: string, providerCode: number): PaymentVerificationDisposition {
  if (provider === 'nextpay') return nextPayVerificationDisposition(providerCode);
  if (provider === 'zibal') return zibalVerificationDisposition(providerCode);
  return 'failed';
}
