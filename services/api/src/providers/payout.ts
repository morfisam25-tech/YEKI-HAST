export interface SubmitPayoutInput {
  payoutId: string;
  amountMinor: bigint;
  currencyCode: 'IRR';
  iban: string;
  accountHolderName: string;
}

export interface SubmitPayoutResult {
  providerReference: string;
  providerTotalMinor: bigint | null;
}

export interface PayoutStatusResult {
  providerStatus: string | null;
  bankTrackingNumber: string | null;
  completed: boolean;
}

export interface PayoutProvider {
  readonly key: string;
  submit(input: SubmitPayoutInput): Promise<SubmitPayoutResult>;
  getStatus(tracker: string): Promise<PayoutStatusResult>;
}

export class PayoutProviderError extends Error {
  readonly code: string;
  readonly providerCode: number | null;

  constructor(code: string, providerCode: number | null = null) {
    super(code);
    this.code = code;
    this.providerCode = providerCode;
  }
}

const CHECKOUT_URL = 'https://nextpay.org/nx/gateway/checkout';
const STATUS_BY_TRACKER_URL = 'https://nextpay.org/nx/gateway/get_checkout_status_tracker';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new PayoutProviderError('payout_provider_not_configured');
  return value;
}

function asInteger(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed)) throw new PayoutProviderError('payout_provider_invalid_response');
  return parsed;
}

function optionalText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalBigInt(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return /^\d+$/.test(text) ? BigInt(text) : null;
}

async function postForm(url: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PayoutProviderError('payout_provider_unavailable');
  }
  if (!response.ok) throw new PayoutProviderError('payout_provider_unavailable');
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new PayoutProviderError('payout_provider_invalid_response'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PayoutProviderError('payout_provider_invalid_response');
  }
  return body as Record<string, unknown>;
}

class NextPayPayoutProvider implements PayoutProvider {
  readonly key = 'nextpay';
  private readonly wid: string;
  private readonly auth: string;

  constructor() {
    this.wid = required('NEXTPAY_PAYOUT_WID');
    this.auth = required('NEXTPAY_PAYOUT_AUTH');
    if (!/^\d+$/.test(this.wid) || this.auth.length < 16) {
      throw new PayoutProviderError('payout_provider_not_configured');
    }
  }

  async submit(input: SubmitPayoutInput): Promise<SubmitPayoutResult> {
    if (input.currencyCode !== 'IRR') throw new PayoutProviderError('payout_currency_not_supported');
    const iban = input.iban.replace(/\s|-/g, '').toUpperCase();
    if (!/^IR\d{24}$/.test(iban)) throw new PayoutProviderError('payout_invalid_iban');
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.payoutId)) throw new PayoutProviderError('payout_invalid_tracker');

    const body = await postForm(CHECKOUT_URL, {
      wid: this.wid,
      auth: this.auth,
      amount: input.amountMinor.toString(),
      sheba: iban.slice(2),
      name: input.accountHolderName,
      tracker: input.payoutId,
      currency: 'IRR',
    });
    const code = asInteger(body.code);
    if (code !== 200) throw new PayoutProviderError('payout_submit_failed', code);
    const trace = optionalText(body.trace);
    if (!trace) throw new PayoutProviderError('payout_provider_invalid_response', code);
    return {
      providerReference: trace,
      providerTotalMinor: optionalBigInt(body.total),
    };
  }

  async getStatus(tracker: string): Promise<PayoutStatusResult> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(tracker)) throw new PayoutProviderError('payout_invalid_tracker');
    const body = await postForm(STATUS_BY_TRACKER_URL, {
      wid: this.wid,
      auth: this.auth,
      tracker,
    });
    const code = asInteger(body.code);
    if (code !== 200) throw new PayoutProviderError('payout_status_failed', code);
    const providerStatus = optionalText(body.status);
    return {
      providerStatus,
      bankTrackingNumber: optionalText(body.trackingNumber),
      completed: providerStatus?.toLowerCase() === 'completed',
    };
  }
}

export function validatePayoutProviderEnv(): void {
  if (process.env.PAYOUT_PROVIDER?.trim() !== 'nextpay') {
    throw new PayoutProviderError('payout_provider_not_configured');
  }
  new NextPayPayoutProvider();
}

export function getPayoutProvider(): PayoutProvider {
  validatePayoutProviderEnv();
  return new NextPayPayoutProvider();
}
