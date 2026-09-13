export type SmsOtpProviderName = 'dev' | 'smsir' | 'farazsms';

export type SmsProviderFailureKind =
  | 'rate_limited'
  | 'temporary_unavailable'
  | 'authentication_failed'
  | 'request_rejected';

export interface SmsOtpInput {
  phoneE164: string;
  code: string;
  ttlSeconds: number;
}

export interface SmsOtpSendResult {
  provider: SmsOtpProviderName;
  templateIdentifier: string;
  providerReferenceId?: string;
}

export interface SmsOtpProvider {
  readonly provider: SmsOtpProviderName;
  readonly templateIdentifier: string;
  sendOtp(input: SmsOtpInput): Promise<SmsOtpSendResult>;
}

export class SmsProviderError extends Error {
  readonly provider: SmsOtpProviderName;
  readonly kind: SmsProviderFailureKind;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(input: {
    provider: SmsOtpProviderName;
    kind: SmsProviderFailureKind;
    retryable: boolean;
    statusCode?: number;
  }) {
    // Never surface provider response bodies, credentials, mobile numbers or OTPs.
    super('sms_delivery_failed');
    this.name = 'SmsProviderError';
    this.provider = input.provider;
    this.kind = input.kind;
    this.retryable = input.retryable;
    this.statusCode = input.statusCode;
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('sms_provider_not_configured');
  return value;
}

function requiredWithFallback(primaryName: string, fallbackName: string): string {
  const value = process.env[primaryName]?.trim() || process.env[fallbackName]?.trim();
  if (!value) throw new Error('sms_provider_not_configured');
  return value;
}

function approvedInProduction(name: string): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env[name]?.trim().toLowerCase() !== 'true') {
    throw new Error('sms_provider_not_configured');
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function optionalJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try { return JSON.parse(text); }
  catch { return undefined; }
}

function httpProviderError(provider: SmsOtpProviderName, statusCode: number): SmsProviderError {
  if (statusCode === 429) {
    return new SmsProviderError({ provider, kind: 'rate_limited', retryable: true, statusCode });
  }
  if (statusCode === 408 || statusCode === 425 || statusCode >= 500) {
    return new SmsProviderError({ provider, kind: 'temporary_unavailable', retryable: true, statusCode });
  }
  if (statusCode === 401 || statusCode === 403) {
    return new SmsProviderError({ provider, kind: 'authentication_failed', retryable: false, statusCode });
  }
  return new SmsProviderError({ provider, kind: 'request_rejected', retryable: false, statusCode });
}

function networkProviderError(provider: SmsOtpProviderName): SmsProviderError {
  return new SmsProviderError({ provider, kind: 'temporary_unavailable', retryable: true });
}

function iranMobileForSmsIr(phoneE164: string): string {
  if (!/^\+989\d{9}$/.test(phoneE164)) {
    throw new SmsProviderError({ provider: 'smsir', kind: 'request_rejected', retryable: false });
  }
  // SMS.ir Verify examples use the national mobile without +98 and without a leading zero: 912xxxxxxxx.
  return phoneE164.slice(3);
}

function iranMobileForFarazSms(phoneE164: string): string {
  if (!/^\+989\d{9}$/.test(phoneE164)) {
    throw new SmsProviderError({ provider: 'farazsms', kind: 'request_rejected', retryable: false });
  }
  // IranPayamak Pattern examples use the Iranian national mobile form: 09xxxxxxxxx.
  return `0${phoneE164.slice(3)}`;
}

class DevSmsProvider implements SmsOtpProvider {
  readonly provider = 'dev' as const;
  readonly templateIdentifier = 'dev';

  async sendOtp(): Promise<SmsOtpSendResult> {
    // Deliberately no console logging of OTPs. In local development the API can return
    // devCode only when DEV_EXPOSE_OTP=true and NODE_ENV=development.
    return { provider: this.provider, templateIdentifier: this.templateIdentifier };
  }
}

class SmsIrProvider implements SmsOtpProvider {
  readonly provider = 'smsir' as const;
  readonly #apiKey: string;
  readonly #templateId: number;
  readonly #parameterName: string;

  constructor() {
    this.#apiKey = required('SMSIR_API_KEY');
    const templateId = Number(required('SMSIR_OTP_TEMPLATE_ID'));
    if (!Number.isSafeInteger(templateId) || templateId <= 0) throw new Error('sms_provider_not_configured');
    this.#templateId = templateId;
    this.#parameterName = process.env.SMSIR_OTP_PARAMETER_NAME?.trim() || 'CODE';
    if (!/^[A-Za-z0-9_]{1,32}$/.test(this.#parameterName)) throw new Error('sms_provider_not_configured');
    approvedInProduction('SMSIR_OTP_TEMPLATE_APPROVED');
  }

  get templateIdentifier(): string {
    return String(this.#templateId);
  }

  async sendOtp(input: SmsOtpInput): Promise<SmsOtpSendResult> {
    let response: Response;
    try {
      response = await fetch('https://api.sms.ir/v1/send/verify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'X-API-KEY': this.#apiKey,
        },
        body: JSON.stringify({
          mobile: iranMobileForSmsIr(input.phoneE164),
          templateId: this.#templateId,
          parameters: [{ name: this.#parameterName, value: input.code }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof SmsProviderError) throw error;
      throw networkProviderError(this.provider);
    }

    if (!response.ok) throw httpProviderError(this.provider, response.status);

    const payload = asRecord(await optionalJson(response));
    // SMS.ir documents a JSON envelope with status=1 on success. A malformed success body
    // is treated as temporary failure so we do not create a false-positive accepted send.
    if (!payload || payload.status !== 1) {
      throw new SmsProviderError({ provider: this.provider, kind: 'temporary_unavailable', retryable: true });
    }
    const data = asRecord(payload.data);
    const rawMessageId = data?.messageId;
    const providerReferenceId = typeof rawMessageId === 'number' || typeof rawMessageId === 'string'
      ? String(rawMessageId)
      : undefined;

    return {
      provider: this.provider,
      templateIdentifier: this.templateIdentifier,
      ...(providerReferenceId ? { providerReferenceId } : {}),
    };
  }
}

class FarazSmsProvider implements SmsOtpProvider {
  readonly provider = 'farazsms' as const;
  readonly #apiKey: string;
  readonly #patternCode: string;
  readonly #lineNumber: string;
  readonly #parameterName: string;

  constructor() {
    this.#apiKey = required('FARAZSMS_API_KEY');
    this.#patternCode = required('FARAZSMS_PATTERN_CODE');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(this.#patternCode)) throw new Error('sms_provider_not_configured');
    this.#lineNumber = requiredWithFallback('FARAZSMS_LINE_NUMBER', 'FARAZSMS_FROM_NUMBER');
    this.#parameterName = process.env.FARAZSMS_OTP_PARAMETER_NAME?.trim() || 'code';
    if (!/^[A-Za-z0-9_]{1,64}$/.test(this.#parameterName)) throw new Error('sms_provider_not_configured');
    approvedInProduction('FARAZSMS_OTP_PATTERN_APPROVED');
  }

  get templateIdentifier(): string {
    return this.#patternCode;
  }

  async sendOtp(input: SmsOtpInput): Promise<SmsOtpSendResult> {
    let response: Response;
    try {
      response = await fetch('https://api.iranpayamak.com/ws/v1/sms/pattern', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'Api-Key': this.#apiKey,
        },
        body: JSON.stringify({
          code: this.#patternCode,
          attributes: { [this.#parameterName]: input.code },
          recipient: iranMobileForFarazSms(input.phoneE164),
          line_number: this.#lineNumber,
          number_format: 'english',
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof SmsProviderError) throw error;
      throw networkProviderError(this.provider);
    }

    if (!response.ok) throw httpProviderError(this.provider, response.status);

    const payload = asRecord(await optionalJson(response));
    // The current official Pattern endpoint documents HTTP 201 with status="success" and
    // a numeric data field. Any other 2xx envelope is a provider-declared rejection rather
    // than a successful send; provider response details are deliberately not surfaced.
    if (!payload || payload.status !== 'success') {
      throw new SmsProviderError({
        provider: this.provider,
        kind: 'request_rejected',
        retryable: false,
        statusCode: response.status,
      });
    }
    const rawReference = payload.data;
    const providerReferenceId = typeof rawReference === 'number' || typeof rawReference === 'string'
      ? String(rawReference)
      : undefined;

    return {
      provider: this.provider,
      templateIdentifier: this.templateIdentifier,
      ...(providerReferenceId !== undefined ? { providerReferenceId } : {}),
    };
  }
}

export function getSmsProvider(): SmsOtpProvider {
  const provider = process.env.SMS_PROVIDER?.trim() || (process.env.NODE_ENV === 'development' ? 'dev' : '');
  if (provider === 'dev') {
    if (process.env.NODE_ENV !== 'development') throw new Error('sms_provider_not_configured');
    return new DevSmsProvider();
  }
  if (provider === 'smsir') return new SmsIrProvider();
  if (provider === 'farazsms') return new FarazSmsProvider();
  throw new Error('sms_provider_not_configured');
}
