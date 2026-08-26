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

export type ListenerTrainingModuleKey =
  | 'active_listening'
  | 'role_boundary'
  | 'safety'
  | 'platform_rules';

export type ListenerApplicationResponse = {
  id: string;
  status: string;
  nickname: string;
  declared_gender: 'female' | 'male';
  short_intro: string | null;
  listening_style: string | null;
  created_at: string;
  languages: Array<{ code: string; proficiency: string }>;
  training: Array<{
    module_key: ListenerTrainingModuleKey;
    status: string;
    progress_percent: number;
    completed_at: string | null;
  }>;
  trainingComplete: boolean;
  latestAssessment: null | {
    id: string;
    result: 'pending' | 'passed' | 'failed';
    score: string | null;
    scenario_version: string;
    created_at: string;
  };
};

export type ListenerKycStatusResponse = {
  applicationStatus: string;
  status: 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';
  verifiedAt: string | null;
  rejectedReasonCode: string | null;
  updatedAt: string | null;
};

export type ListenerPresenceResponse = {
  status: 'online' | 'offline' | 'paused';
  acceptsMale: boolean;
  acceptsFemale: boolean;
  onlineSince: string | null;
  lastHeartbeatAt: string | null;
};

export type WalletResponse = {
  wallets: Array<{
    currencyCode: string;
    balanceMinor: string;
    reservedMinor: string;
    availableMinor: string;
    version: string;
  }>;
};

export type WalletTransactionsResponse = {
  transactions: Array<{
    id: string;
    currencyCode: string;
    type: string;
    deltaMinor: string;
    balanceAfterMinor: string;
    callId: string | null;
    paymentAttemptId: string | null;
    reasonCode: string | null;
    createdAt: string;
  }>;
};

export type WalletTopupResponse = {
  ok?: boolean;
  attemptId: string;
  provider?: string;
  status: string;
  currencyCode: string;
  amountMinor: string;
  providerPaymentId?: string | null;
  paymentUrl?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  providerCode?: number | null;
  balanceMinor?: string | null;
  idempotent?: boolean;
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

export function getWallet(token: string): Promise<WalletResponse> {
  return request('/v1/wallet', {}, token);
}

export function getWalletTransactions(token: string, currencyCode = 'IRR', limit = 50): Promise<WalletTransactionsResponse> {
  const params = new URLSearchParams({ currency: currencyCode, limit: String(limit) });
  return request(`/v1/wallet/transactions?${params.toString()}`, {}, token);
}

export function createWalletTopup(
  token: string,
  amountMinor: string,
  idempotencyKey: string,
): Promise<WalletTopupResponse> {
  return request('/v1/wallet/topups', {
    method: 'POST',
    body: JSON.stringify({ amountMinor, idempotencyKey }),
  }, token);
}

export function getWalletTopup(token: string, attemptId: string): Promise<WalletTopupResponse> {
  return request(`/v1/wallet/topups/${encodeURIComponent(attemptId)}`, {}, token);
}

export function verifyWalletTopup(token: string, attemptId: string): Promise<WalletTopupResponse> {
  return request(`/v1/wallet/topups/${encodeURIComponent(attemptId)}/verify`, { method: 'POST' }, token);
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

export function getListenerApplication(token: string): Promise<ListenerApplicationResponse> {
  return request('/v1/listener/application', {}, token);
}

export function completeListenerTraining(
  token: string,
  moduleKey: ListenerTrainingModuleKey,
): Promise<{ ok: true; applicationId: string; trainingComplete: boolean; status: string }> {
  return request('/v1/listener/training/complete', {
    method: 'POST',
    body: JSON.stringify({ moduleKey }),
  }, token);
}

export function submitListenerAssessment(
  token: string,
  answers: Record<string, string>,
): Promise<{ ok: true; attemptId: string; status: 'pending' }> {
  return request('/v1/listener/assessment', {
    method: 'POST',
    body: JSON.stringify({ scenarioVersion: 'listener-beta-v1', answers }),
  }, token);
}

export function getListenerKycStatus(token: string): Promise<ListenerKycStatusResponse> {
  return request('/v1/listener/kyc', {}, token);
}

export function submitListenerKyc(
  token: string,
  input: {
    legalName: string;
    nationalId: string;
    dateOfBirthJalali: string;
    bankIban: string;
    bankAccountHolder?: string;
  },
): Promise<{ ok: true; status: 'pending'; applicationId: string }> {
  return request('/v1/listener/kyc', {
    method: 'POST',
    body: JSON.stringify(input),
  }, token);
}

export function getListenerPresence(token: string): Promise<ListenerPresenceResponse> {
  return request('/v1/listener/presence', {}, token);
}

export function setListenerPresence(
  token: string,
  status: 'online' | 'offline' | 'paused',
  acceptsMale = true,
  acceptsFemale = true,
): Promise<{ ok: true; status: 'online' | 'offline' | 'paused'; acceptsMale: boolean; acceptsFemale: boolean; workSessionId: string | null }> {
  return request('/v1/listener/presence', {
    method: 'POST',
    body: JSON.stringify({ status, acceptsMale, acceptsFemale }),
  }, token);
}

export function heartbeatListenerPresence(token: string): Promise<{ ok: true; status: 'online' | 'paused' }> {
  return request('/v1/listener/presence/heartbeat', { method: 'POST' }, token);
}
