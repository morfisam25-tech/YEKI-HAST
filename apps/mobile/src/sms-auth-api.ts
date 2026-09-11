import { API_BASE_URL, type SessionResponse } from './api';

class SmsAuthApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let value: unknown = null;
  try { value = await response.json(); } catch {}
  if (!response.ok) {
    const code = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
      ? String((value as { error: string }).error)
      : 'request_failed';
    throw new SmsAuthApiError(code);
  }
  return value as T;
}

export function getSmsAuthErrorCode(error: unknown): string {
  return error instanceof SmsAuthApiError ? error.code : 'network_error';
}

export async function requestSmsOtp(phone: string): Promise<void> {
  await request('/v1/auth/request', { phone });
}

export function verifySmsOtp(phone: string, code: string): Promise<SessionResponse> {
  return request('/v1/auth/verify', { phone, code });
}
