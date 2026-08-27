export interface SmsProvider {
  sendOtp(input: { phoneE164: string; code: string; ttlSeconds: number }): Promise<void>;
}

class DevSmsProvider implements SmsProvider {
  async sendOtp(): Promise<void> {
    // Deliberately no console logging of OTPs. In local development the API can return
    // devCode only when DEV_EXPOSE_OTP=true and NODE_ENV=development.
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('sms_provider_not_configured');
  return value;
}

function iranLocalMobile(phoneE164: string): string {
  if (phoneE164.startsWith('+98')) return `0${phoneE164.slice(3)}`;
  return phoneE164;
}

function kavenegarReceptor(phoneE164: string): string {
  // Kavenegar accepts Iranian mobile numbers in local 09... form.
  if (phoneE164.startsWith('+98')) return `0${phoneE164.slice(3)}`;
  // Their Lookup docs specify 00 + country code for international receptors.
  return `00${phoneE164.slice(1)}`;
}

class KavenegarSmsProvider implements SmsProvider {
  readonly #apiKey: string;
  readonly #template: string;

  constructor() {
    this.#apiKey = required('KAVENEGAR_API_KEY');
    this.#template = required('KAVENEGAR_OTP_TEMPLATE');
  }

  async sendOtp(input: { phoneE164: string; code: string; ttlSeconds: number }): Promise<void> {
    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(this.#apiKey)}/verify/lookup.json`;
    const body = new URLSearchParams({
      receptor: kavenegarReceptor(input.phoneE164),
      token: input.code,
      template: this.#template,
      type: 'sms',
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Never bubble the URL because it contains the API key.
      throw new Error('sms_delivery_failed');
    }

    if (!response.ok) throw new Error('sms_delivery_failed');

    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new Error('sms_delivery_failed'); }

    const status = (payload as { return?: { status?: unknown } } | null)?.return?.status;
    if (status !== 200) throw new Error('sms_delivery_failed');
  }
}

class IPPanelSmsProvider implements SmsProvider {
  readonly #apiKey: string;
  readonly #patternCode: string;
  readonly #fromNumber: string;

  constructor() {
    this.#apiKey = required('IPPANEL_API_KEY');
    this.#patternCode = required('IPPANEL_PATTERN_CODE');
    this.#fromNumber = required('IPPANEL_FROM_NUMBER');
  }

  async sendOtp(input: { phoneE164: string; code: string; ttlSeconds: number }): Promise<void> {
    let response: Response;
    try {
      response = await fetch('https://edge.ippanel.com/v1/api/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: this.#apiKey,
        },
        body: JSON.stringify({
          sending_type: 'pattern',
          from_number: this.#fromNumber,
          code: this.#patternCode,
          recipients: [input.phoneE164],
          params: { code: input.code },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('sms_delivery_failed');
    }

    if (!response.ok) throw new Error('sms_delivery_failed');
    try { await response.json(); }
    catch { throw new Error('sms_delivery_failed'); }
  }
}

class SmsIrProvider implements SmsProvider {
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

    // SMS.ir can accept a template configuration before that template is approved for delivery.
    // Production must require an explicit operator acknowledgement after the panel shows approval.
    if (process.env.NODE_ENV === 'production' && process.env.SMSIR_OTP_TEMPLATE_APPROVED?.trim().toLowerCase() !== 'true') {
      throw new Error('sms_provider_not_configured');
    }
  }

  async sendOtp(input: { phoneE164: string; code: string; ttlSeconds: number }): Promise<void> {
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
          mobile: iranLocalMobile(input.phoneE164),
          templateId: this.#templateId,
          parameters: [{ name: this.#parameterName, value: input.code }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('sms_delivery_failed');
    }

    // The public docs page is JS-rendered and its response schema is not relied upon here.
    // Fail closed on any non-2xx response; do not infer undocumented success fields.
    if (!response.ok) throw new Error('sms_delivery_failed');
  }
}

export function getSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER?.trim() || (process.env.NODE_ENV === 'development' ? 'dev' : '');
  if (provider === 'dev') {
    if (process.env.NODE_ENV !== 'development') throw new Error('sms_provider_not_configured');
    return new DevSmsProvider();
  }
  if (provider === 'kavenegar') return new KavenegarSmsProvider();
  if (provider === 'ippanel') return new IPPanelSmsProvider();
  if (provider === 'smsir') return new SmsIrProvider();
  throw new Error('sms_provider_not_configured');
}
