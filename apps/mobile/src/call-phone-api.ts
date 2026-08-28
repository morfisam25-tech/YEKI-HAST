import { API_BASE_URL, normalizeIranPhone } from './api';

class CallPhoneApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  let value: unknown = null;
  try { value = await response.json(); } catch {}
  if (!response.ok) {
    const code = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
      ? String((value as { error: string }).error)
      : 'request_failed';
    throw new CallPhoneApiError(code);
  }
  return value as T;
}

export type CallPhoneStatus = { configured: boolean; verified: boolean };

export function getCallPhoneErrorCode(error: unknown): string {
  return error instanceof CallPhoneApiError ? error.code : 'network_error';
}

export function getCallPhoneStatus(token: string): Promise<CallPhoneStatus> {
  return request('/v1/account/call-phone', token);
}

export function submitCallPhone(token: string, phoneInput: string): Promise<{ ok: true; configured: true; verified: boolean }> {
  const phone = normalizeIranPhone(phoneInput);
  return request('/v1/account/call-phone', token, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}
