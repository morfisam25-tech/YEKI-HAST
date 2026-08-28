import { API_BASE_URL } from './api';

export type CallerRecentCall = {
  callId: string;
  status: 'completed' | 'missed' | 'cancelled' | 'failed' | 'safety_terminated';
  currencyCode: string;
  requestedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  billableSeconds: number;
  callerChargeMinor: string;
  counterpartyActionAvailable: boolean;
};

export type CallerRecentCallsResponse = {
  calls: CallerRecentCall[];
  providerBridgeIncluded?: false;
  listenerIdentityIncluded?: false;
};

export class CallerHistoryApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function getCallerHistoryErrorCode(error: unknown): string {
  return error instanceof CallerHistoryApiError ? error.code : 'network_error';
}

export async function getCallerRecentCalls(token: string, limit = 10): Promise<CallerRecentCallsResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/caller/calls/recent?limit=${encodeURIComponent(String(limit))}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });

  let body: unknown = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const code = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? String((body as { error: string }).error)
      : 'request_failed';
    throw new CallerHistoryApiError(code, response.status);
  }
  return body as CallerRecentCallsResponse;
}
