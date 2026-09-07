import { API_BASE_URL } from './api';

export type ListenerAvailability = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'open' | 'cancelled';
  acceptsMale: boolean;
  acceptsFemale: boolean;
};

export type ListenerBooking = {
  id: string;
  languageCode: string;
  scheduledAt: string;
  maxBillableSeconds: number;
  status: 'booked' | 'cancelled' | 'initiated' | 'missed';
  callId: string | null;
};

class BookingApiError extends Error {
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
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? String((payload as { error: string }).error)
      : 'request_failed';
    throw new BookingApiError(code);
  }
  return payload as T;
}

export function getBookingErrorCode(error: unknown): string {
  return error instanceof BookingApiError ? error.code : 'network_error';
}

export function getListenerAvailability(token: string): Promise<{ availability: ListenerAvailability[] }> {
  return request('/v1/listener/availability', token);
}

export function createListenerAvailability(
  token: string,
  input: { startsAt: string; endsAt: string; acceptsMale: boolean; acceptsFemale: boolean },
): Promise<{ ok: true; availability: ListenerAvailability }> {
  return request('/v1/listener/availability', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function cancelListenerAvailability(token: string, id: string): Promise<{ ok: true }> {
  return request(`/v1/listener/availability/${encodeURIComponent(id)}/cancel`, token, {
    method: 'POST',
    body: '{}',
  });
}

export function getListenerBookings(token: string): Promise<{ bookings: ListenerBooking[] }> {
  return request('/v1/listener/bookings', token);
}
