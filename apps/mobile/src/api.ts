export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://yeki-hast.vercel.app').replace(/\/$/, '');

export type BootstrapLanguage = {
  code: string;
  nameFa: string;
  nameEn: string | null;
};

export type BootstrapResponse = {
  brandName: string;
  market: { code: string; countryCode: string; timezone: string };
  pricing: {
    currencyCode: string;
    callerRatePerMinuteMinor: number;
    listenerRatePerMinuteMinor: number;
    platformGrossSpreadPerMinuteMinor: number;
    billingIncrementSeconds: number;
    displayUnit: string;
    displayDivisor: number;
  };
  languages: BootstrapLanguage[];
};

export type SessionResponse = {
  ok: true;
  userId: string;
  token: string;
  expiresInHours: number;
};

class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  let body: unknown = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const code = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? String((body as { error: string }).error)
      : 'request_failed';
    throw new ApiError(code, response.status);
  }
  return body as T;
}

export function normalizeIranPhone(input: string): string {
  const value = input.replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(value)) return `+98${value.slice(1)}`;
  if (/^\+98\d{10}$/.test(value)) return value;
  throw new ApiError('invalid_phone', 400);
}

export function getErrorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'network_error';
}

export function getBootstrap(): Promise<BootstrapResponse> {
  return request('/v1/bootstrap');
}

export async function requestOtp(phoneE164: string): Promise<void> {
  await request('/v1/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone: phoneE164 }),
  });
}

export function verifyOtp(phoneE164: string, code: string): Promise<SessionResponse> {
  return request('/v1/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone: phoneE164, code }),
  });
}

export function createListenerApplication(
  token: string,
  input: {
    nickname: string;
    gender: 'female' | 'male';
    shortIntro?: string;
    listeningStyle?: string;
    languages: Array<{ code: string; proficiency: 'conversational' | 'fluent' | 'native' }>;
  },
): Promise<{ ok: true; applicationId: string; status: string }> {
  return request('/v1/listener/application', {
    method: 'POST',
    body: JSON.stringify(input),
  }, token);
}
