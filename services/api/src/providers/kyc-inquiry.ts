export type NextPayInquiryKind = 'sabtahval' | 'shahkar' | 'sheba';

export type NextPayInquiryEnvelope<T = unknown> = {
  code: number;
  error: string | null;
  data: T;
  fee: number;
  feeIrr: number;
  inquiryBalance: number;
  inquiryBalanceIrr: number;
};

export type SabtAhvalData = {
  inq: string;
  inq_desc: string;
  inq_id: number;
  national_id: string;
  jalali_birth: string;
  match: boolean;
  first_name: string;
  last_name: string;
  father_name: string;
  is_alive: number;
};

export type SabtAhvalInput = {
  nationalId: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
};

export type ShahkarInput = {
  nationalId: string;
  mobile: string;
};

export type ShebaInput = {
  sheba: string;
};

export class KycInquiryProviderError extends Error {
  readonly code: string;
  readonly providerCode: number | null;

  constructor(code: string, providerCode: number | null = null) {
    super(code);
    this.code = code;
    this.providerCode = providerCode;
  }
}

const BASE_URL = 'https://nextpay.org/nx/inquiry';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIONAL_ID_RE = /^\d{10}$/;
const MOBILE_RE = /^09\d{9}$/;
const SHEBA_RE = /^\d{24}$/;
const JALALI_YEAR_RE = /^1[34]\d{2}$/;
const MONTH_RE = /^(0[1-9]|1[0-2])$/;
const DAY_RE = /^(0[1-9]|[12]\d|3[01])$/;

type FetchLike = typeof fetch;

function requiredInquiryKey(): string {
  const value = process.env.NEXTPAY_INQUIRY_API?.trim();
  if (!value || !UUID_RE.test(value)) throw new KycInquiryProviderError('kyc_inquiry_not_configured');
  return value;
}

function numberField(body: Record<string, unknown>, key: string): number {
  const raw = body[key];
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) throw new KycInquiryProviderError('kyc_inquiry_invalid_response');
  return value;
}

function nullableError(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw new KycInquiryProviderError('kyc_inquiry_invalid_response');
}

function parseEnvelope(body: unknown): NextPayInquiryEnvelope<unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new KycInquiryProviderError('kyc_inquiry_invalid_response');
  }
  const value = body as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(value, 'data')) {
    throw new KycInquiryProviderError('kyc_inquiry_invalid_response');
  }
  return {
    code: numberField(value, 'code'),
    error: nullableError(value.error),
    data: value.data,
    fee: numberField(value, 'fee'),
    feeIrr: numberField(value, 'fee_irr'),
    inquiryBalance: numberField(value, 'inq_balance'),
    inquiryBalanceIrr: numberField(value, 'inq_balance_irr'),
  };
}

function sabtAhvalData(value: unknown): SabtAhvalData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new KycInquiryProviderError('kyc_inquiry_invalid_response');
  }
  const row = value as Record<string, unknown>;
  const requiredStrings = ['inq', 'inq_desc', 'national_id', 'jalali_birth', 'first_name', 'last_name', 'father_name'] as const;
  for (const key of requiredStrings) {
    if (typeof row[key] !== 'string') throw new KycInquiryProviderError('kyc_inquiry_invalid_response');
  }
  if (!Number.isFinite(Number(row.inq_id)) || typeof row.match !== 'boolean' || !Number.isFinite(Number(row.is_alive))) {
    throw new KycInquiryProviderError('kyc_inquiry_invalid_response');
  }
  return {
    inq: row.inq as string,
    inq_desc: row.inq_desc as string,
    inq_id: Number(row.inq_id),
    national_id: row.national_id as string,
    jalali_birth: row.jalali_birth as string,
    match: row.match,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    father_name: row.father_name as string,
    is_alive: Number(row.is_alive),
  };
}

export class NextPayKycInquiryProvider {
  readonly key = 'nextpay';
  private readonly inquiryApi: string;
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.inquiryApi = requiredInquiryKey();
    this.fetchImpl = fetchImpl;
  }

  private async post(kind: NextPayInquiryKind, values: Record<string, string>): Promise<NextPayInquiryEnvelope<unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${BASE_URL}/${kind}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({ inquiry_api: this.inquiryApi, ...values }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new KycInquiryProviderError('kyc_inquiry_unavailable');
    }

    let body: unknown;
    try { body = await response.json(); }
    catch { throw new KycInquiryProviderError('kyc_inquiry_invalid_response'); }

    const envelope = parseEnvelope(body);
    if (!response.ok || envelope.code !== 200) {
      throw new KycInquiryProviderError('kyc_inquiry_failed', envelope.code);
    }
    return envelope;
  }

  async sabtAhval(input: SabtAhvalInput): Promise<NextPayInquiryEnvelope<SabtAhvalData>> {
    if (!NATIONAL_ID_RE.test(input.nationalId)) throw new KycInquiryProviderError('invalid_national_id');
    if (!JALALI_YEAR_RE.test(input.birthYear) || !MONTH_RE.test(input.birthMonth) || !DAY_RE.test(input.birthDay)) {
      throw new KycInquiryProviderError('invalid_jalali_birth_date');
    }
    const response = await this.post('sabtahval', {
      national_id: input.nationalId,
      birth_year: input.birthYear,
      birth_month: input.birthMonth,
      birth_day: input.birthDay,
    });
    return { ...response, data: sabtAhvalData(response.data) };
  }

  async shahkar(input: ShahkarInput): Promise<NextPayInquiryEnvelope<unknown>> {
    if (!NATIONAL_ID_RE.test(input.nationalId)) throw new KycInquiryProviderError('invalid_national_id');
    if (!MOBILE_RE.test(input.mobile)) throw new KycInquiryProviderError('invalid_mobile');
    // NextPay documents the request and top-level envelope, but not Shahkar's
    // concrete data fields. Keep data unknown until an official contract is available.
    return this.post('shahkar', { national_id: input.nationalId, mobile: input.mobile });
  }

  async sheba(input: ShebaInput): Promise<NextPayInquiryEnvelope<unknown>> {
    const digits = input.sheba.startsWith('IR') ? input.sheba.slice(2) : input.sheba;
    if (!SHEBA_RE.test(digits)) throw new KycInquiryProviderError('invalid_sheba');
    // NextPay requires the 24 digits without the IR prefix. Response data remains
    // unknown because the official page does not publish its field-level schema.
    return this.post('sheba', { sheba: digits });
  }
}

export function validateKycInquiryProviderEnv(): void {
  const provider = process.env.KYC_INQUIRY_PROVIDER?.trim();
  if (provider !== 'nextpay') throw new KycInquiryProviderError('kyc_inquiry_not_configured');
  new NextPayKycInquiryProvider();
}

export function getKycInquiryProvider(): NextPayKycInquiryProvider {
  validateKycInquiryProviderEnv();
  return new NextPayKycInquiryProvider();
}
