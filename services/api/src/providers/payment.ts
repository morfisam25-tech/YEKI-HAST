export interface CreatePaymentInput {
  userId: string;
  amountMinor: number;
  currencyCode: string;
  idempotencyKey: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  redirectUrl?: string;
}

export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(providerPaymentId: string): Promise<{ paid: boolean; providerFeeMinor?: number }>;
  refund(providerPaymentId: string, amountMinor: number): Promise<void>;
}

export function getPaymentProvider(): PaymentProvider {
  throw new Error('PaymentProvider adapter is not configured yet');
}
