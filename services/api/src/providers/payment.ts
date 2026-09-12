export type PaymentProviderKey = 'nextpay' | 'zibal';

export interface CreatePaymentInput {
  orderId: string;
  amountMinor: bigint;
  currencyCode: 'IRR' | 'IRT';
  callbackUri: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  redirectUrl: string;
}

export interface VerifyPaymentInput {
  providerPaymentId: string;
  amountMinor: bigint;
  currencyCode: 'IRR' | 'IRT';
}

export interface VerifyPaymentResult {
  paid: boolean;
  providerCode: number;
  orderId: string | null;
  amountMinor: bigint | null;
  providerReference: string | null;
}

export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  refund(providerPaymentId: string, amountMinor: bigint, currencyCode: 'IRR' | 'IRT'): Promise<void>;
}

export class PaymentProviderError extends Error {
  readonly code: string;
  readonly providerCode: number | null;

  constructor(code: string, providerCode: number | null = null) {
    super(code);
    this.code = code;
    this.providerCode = providerCode;
  }
}

const NEXT_PAY_TOKEN_URL = 'https://nextpay.org/nx/gateway/token';
const NEXT_PAY_VERIFY_URL = 'https://nextpay.org/nx/gateway/verify';
const NEXT_PAY_PAYMENT_URL = 'https://nextpay.org/nx/gateway/payment';
const ZIBAL_REQUEST_URL = 'https://gateway.zibal.ir/v1/request';
const ZIBAL_VERIFY_URL = 'https://gateway.zibal.ir/v1/verify';
const ZIBAL_PAYMENT_URL = 'https://gateway.zibal.ir/start';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new PaymentProviderError('payment_provider_not_configured');
  return value;
}

function validateCallbackBaseUrl(): void {
  const raw = process.env.PAYMENT_CALLBACK_BASE_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new PaymentProviderError('payment_provider_not_configured');
    return;
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new PaymentProviderError('payment_provider_not_configured'); }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new PaymentProviderError('payment_provider_not_configured');
  }
}

function parseProviderCode(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed)) throw new PaymentProviderError('payment_provider_invalid_response');
  return parsed;
}

function optionalBigInt(value: unknown): bigint | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalIdentifier(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}

function zibalTrackId(value: unknown): string | null {
  const valueText = optionalIdentifier(value);
  if (!valueText || !/^[1-9][0-9]{0,17}$/.test(valueText)) return null;
  return valueText;
}

async function postForm(url: string, values: Record<string, string>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PaymentProviderError('payment_provider_unavailable');
  }

  if (!response.ok) throw new PaymentProviderError('payment_provider_unavailable');

  let body: unknown;
  try { body = await response.json(); }
  catch { throw new PaymentProviderError('payment_provider_invalid_response'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PaymentProviderError('payment_provider_invalid_response');
  }
  return body as Record<string, unknown>;
}

async function postJson(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PaymentProviderError('payment_provider_unavailable');
  }

  if (!response.ok) throw new PaymentProviderError('payment_provider_unavailable');

  let parsed: unknown;
  try { parsed = await response.json(); }
  catch { throw new PaymentProviderError('payment_provider_invalid_response'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PaymentProviderError('payment_provider_invalid_response');
  }
  return parsed as Record<string, unknown>;
}

class NextPayProvider implements PaymentProvider {
  readonly key = 'nextpay';
  private readonly apiKey: string;

  constructor() {
    this.apiKey = required('NEXTPAY_API_KEY');
    if (!UUID_RE.test(this.apiKey)) throw new PaymentProviderError('payment_provider_not_configured');
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const body = await postForm(NEXT_PAY_TOKEN_URL, {
      api_key: this.apiKey,
      order_id: input.orderId,
      amount: input.amountMinor.toString(),
      callback_uri: input.callbackUri,
      currency: input.currencyCode,
    });
    const code = parseProviderCode(body.code);
    const transId = optionalString(body.trans_id);
    if (code !== -1 || !transId || !UUID_RE.test(transId)) {
      throw new PaymentProviderError('payment_token_failed', code);
    }
    return {
      providerPaymentId: transId,
      redirectUrl: `${NEXT_PAY_PAYMENT_URL}/${encodeURIComponent(transId)}`,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const body = await postForm(NEXT_PAY_VERIFY_URL, {
      api_key: this.apiKey,
      trans_id: input.providerPaymentId,
      amount: input.amountMinor.toString(),
      currency: input.currencyCode,
    });
    const providerCode = parseProviderCode(body.code);
    return {
      paid: providerCode === 0,
      providerCode,
      orderId: optionalString(body.order_id),
      amountMinor: optionalBigInt(body.amount),
      providerReference: optionalString(body.Shaparak_Ref_Id),
    };
  }

  async refund(providerPaymentId: string, amountMinor: bigint, currencyCode: 'IRR' | 'IRT'): Promise<void> {
    const body = await postForm(NEXT_PAY_VERIFY_URL, {
      api_key: this.apiKey,
      trans_id: providerPaymentId,
      amount: amountMinor.toString(),
      currency: currencyCode,
      refund_request: 'yes_money_back',
    });
    const code = parseProviderCode(body.code);
    if (code !== -90) throw new PaymentProviderError('payment_refund_failed', code);
  }
}

class ZibalProvider implements PaymentProvider {
  readonly key = 'zibal' as const;
  private readonly merchant: string;

  constructor() {
    this.merchant = required('ZIBAL_MERCHANT');
    if (process.env.NODE_ENV === 'production' && this.merchant.toLowerCase() === 'zibal') {
      throw new PaymentProviderError('payment_provider_not_configured');
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (input.currencyCode !== 'IRR' || input.amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new PaymentProviderError('payment_token_failed');
    }
    const body = await postJson(ZIBAL_REQUEST_URL, {
      merchant: this.merchant,
      amount: Number(input.amountMinor),
      callbackUrl: input.callbackUri,
      orderId: input.orderId,
    });
    const code = parseProviderCode(body.result);
    const trackId = zibalTrackId(body.trackId);
    if (code !== 100 || !trackId) throw new PaymentProviderError('payment_token_failed', code);
    return {
      providerPaymentId: trackId,
      redirectUrl: `${ZIBAL_PAYMENT_URL}/${encodeURIComponent(trackId)}`,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (input.currencyCode !== 'IRR' || !zibalTrackId(input.providerPaymentId)) {
      throw new PaymentProviderError('payment_provider_invalid_response');
    }
    const body = await postJson(ZIBAL_VERIFY_URL, {
      merchant: this.merchant,
      trackId: Number(input.providerPaymentId),
    });
    const result = parseProviderCode(body.result);
    const status = typeof body.status === 'number' ? body.status : Number(body.status);
    const paid = result === 100 && status === 1;
    return {
      paid,
      // Result 100 without the successful status stays pending in the route and can never credit a wallet.
      providerCode: paid ? result : (result === 100 ? -1 : result),
      orderId: optionalIdentifier(body.orderId),
      amountMinor: optionalBigInt(body.amount),
      providerReference: optionalIdentifier(body.refNumber),
    };
  }

  async refund(_providerPaymentId: string, _amountMinor: bigint, _currencyCode: 'IRR' | 'IRT'): Promise<void> {
    // Zibal refunds require separately activated corporate banking. The product's refund policy is not approved yet.
    throw new PaymentProviderError('payment_refund_not_supported');
  }
}

export function isProviderPaymentId(provider: string, providerPaymentId: string): boolean {
  if (provider === 'nextpay') return UUID_RE.test(providerPaymentId);
  if (provider === 'zibal') return zibalTrackId(providerPaymentId) !== null;
  return false;
}

export function paymentRedirectUrl(provider: string, providerPaymentId: string): string | null {
  if (!isProviderPaymentId(provider, providerPaymentId)) return null;
  if (provider === 'nextpay') return `${NEXT_PAY_PAYMENT_URL}/${encodeURIComponent(providerPaymentId)}`;
  if (provider === 'zibal') return `${ZIBAL_PAYMENT_URL}/${encodeURIComponent(providerPaymentId)}`;
  return null;
}

export function validatePaymentProviderEnv(): void {
  const provider = process.env.PAYMENT_PROVIDER?.trim();
  if (provider === 'nextpay') new NextPayProvider();
  else if (provider === 'zibal') new ZibalProvider();
  else throw new PaymentProviderError('payment_provider_not_configured');
  validateCallbackBaseUrl();
}

export function getPaymentProvider(): PaymentProvider {
  validatePaymentProviderEnv();
  if (process.env.PAYMENT_PROVIDER?.trim() === 'nextpay') return new NextPayProvider();
  return new ZibalProvider();
}
