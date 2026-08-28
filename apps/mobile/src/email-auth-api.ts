import { API_BASE_URL, type SessionResponse } from './api';

class EmailAuthApiError extends Error {
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
    throw new EmailAuthApiError(code);
  }
  return value as T;
}

export function getEmailAuthErrorCode(error: unknown): string {
  return error instanceof EmailAuthApiError ? error.code : 'network_error';
}

export async function requestEmailOtp(email: string): Promise<void> {
  await request('/v1/auth/email/request', { email });
}

export function verifyEmailOtp(email: string, code: string): Promise<SessionResponse> {
  return request('/v1/auth/email/verify', { email, code });
}
