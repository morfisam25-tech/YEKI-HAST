import { isProductionOrigin, resolveAppEnv } from './env.ts';

export const PRODUCTION_API_BASE_URL = 'https://yeki-hast-unique-6ff0.vercel.app';

// W63: environment identity (EXPO_PUBLIC_APP_ENV), never a bare
// EXPO_PUBLIC_API_BASE_URL fallback alone -- mirrors apps/web/app/api/_backend.ts's
// backendBaseUrl() exactly. Preview (Internal Beta) builds must never silently
// fall back to the Production API: a missing or Production-pointing Preview
// origin fails closed instead of defaulting anywhere. See
// docs/W63_WEB_REALTIMEKIT_RELEASE_P0_CLOSURE.md section 9.
export function resolveApiBaseUrl(): string {
  const env = resolveAppEnv();
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (env === 'production') {
    return (configured || PRODUCTION_API_BASE_URL).replace(/\/$/, '');
  }

  // closed_test (W86) shares preview_internal_beta's fail-closed origin
  // resolution: the Google Play Closed-Test build must never silently fall
  // back to, or be pointed at, the Production API.
  if (env === 'preview_internal_beta' || env === 'closed_test') {
    if (!configured) {
      throw new Error(`EXPO_PUBLIC_API_BASE_URL is required in ${env}; it must never fall back to the Production API`);
    }
    const normalized = configured.replace(/\/$/, '');
    if (isProductionOrigin(normalized, PRODUCTION_API_BASE_URL)) {
      throw new Error(`EXPO_PUBLIC_API_BASE_URL must not point at the Production API origin in ${env}`);
    }
    return normalized;
  }

  // local: no EAS build profile in play (bare `expo start`); an explicit
  // override is honored, otherwise fall back to a local dev server -- never Production.
  if (configured) return configured.replace(/\/$/, '');
  return 'http://localhost:4000';
}

export const API_BASE_URL = resolveApiBaseUrl();

export type BootstrapLanguage = {
  code: string;
  nameFa: string;
  nameEn: string | null;
};

export type PublicLegalConfig = {
  ready: boolean;
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  accountDeletionUrl: string | null;
  childSafetyUrl: string | null;
  supportEmail: string | null;
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
  features?: {
    callerClosedBetaEnabled?: boolean;
  };
  legal?: PublicLegalConfig;
  languages: BootstrapLanguage[];
};

export type SessionResponse = {
  ok: true;
  userId: string;
  token: string;
  expiresInHours: number;
};

export type ListenerTrainingModuleKey =
  | 'role_boundary'
  | 'active_listening'
  | 'what_not_to_say'
  | 'platform_rules'
  | 'safety'
  | 'closing_conversation'
  | 'scenarios';

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

export type ListenerEarningStatus = 'pending' | 'available' | 'paid';

export type ListenerEarningsResponse = {
  summary: Array<{
    currencyCode: string;
    status: ListenerEarningStatus;
    amountMinor: string;
    earningCount: number;
  }>;
  recent: Array<{
    currencyCode: string;
    amountMinor: string;
    status: ListenerEarningStatus;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type ListenerActiveCall = {
  callId: string;
  status: 'requested' | 'routing' | 'calling_caller' | 'caller_answered' | 'calling_listener' | 'connected';
  currencyCode: string;
  maxBillableSeconds: number | null;
  transport: 'internet_voice' | 'masked_pstn' | null;
  internetVoiceReady: boolean;
  telephonyReady: boolean;
  terminationInProgress: boolean;
  requestedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  billableSeconds: number;
  listenerEarningMinor: string;
};

export type ListenerActiveCallResponse = {
  activeCall: ListenerActiveCall | null;
  providerBridgeIncluded?: false;
  callerIdentityIncluded?: false;
};

export type ListenerRecentCall = {
  callId: string;
  status: 'completed' | 'missed' | 'cancelled' | 'failed' | 'safety_terminated';
  currencyCode: string;
  requestedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  billableSeconds: number;
  listenerEarningMinor: string;
  counterpartyActionAvailable: boolean;
};

export type ListenerRecentCallsResponse = {
  calls: ListenerRecentCall[];
  providerBridgeIncluded?: false;
  callerIdentityIncluded?: false;
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

export type CallResponse = {
  ok?: boolean;
  callId: string;
  status: string;
  listenerId?: string | null;
  currencyCode?: string;
  authorizedMinor?: string;
  maxBillableSeconds?: number | null;
  transport?: 'internet_voice' | 'masked_pstn' | null;
  requestedAt?: string;
  connectedAt?: string | null;
  endedAt?: string | null;
  billableSeconds?: number;
  callerChargeMinor?: string;
  telephonyReady?: boolean;
  terminationInProgress?: boolean;
  idempotent?: boolean;
};

export type SafetyExitResponse = {
  ok: true;
  callId: string;
  status: string;
  blocked: boolean;
  idempotent: boolean;
  safetyEventId: string | null;
  settlement: null | {
    billableSeconds: number;
    callerChargeMinor: string;
    listenerEarningMinor: string;
    idempotent: boolean;
  };
};

export type BrowseListener = {
  id: string;
  nickname: string;
  gender: 'female' | 'male';
  verified: boolean;
  reliabilityScore: number;
  shortIntro: string | null;
  listeningStyle: string | null;
  completedCalls: number;
  ratingAverage: number | null;
  ratingCount: number;
  presence: string;
  languages: Array<{ code: string; nameFa: string; nameEn: string | null; proficiency: string }>;
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

export function getCurrentSession(token: string): Promise<{ ok: true; userId: string }> {
  return request('/v1/auth/session', {}, token);
}

export function logoutCurrentSession(token: string): Promise<{ ok: true }> {
  return request('/v1/auth/logout', { method: 'POST' }, token);
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
    body: JSON.stringify({ scenarioVersion: 'listener-beta-v2', answers }),
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

export function getListenerEarnings(token: string): Promise<ListenerEarningsResponse> {
  return request('/v1/listener/earnings', {}, token);
}

export function getListenerActiveCall(token: string): Promise<ListenerActiveCallResponse> {
  return request('/v1/listener/calls/active', {}, token);
}

export function getListenerRecentCalls(token: string, limit = 10): Promise<ListenerRecentCallsResponse> {
  return request(`/v1/listener/calls/recent?limit=${encodeURIComponent(String(limit))}`, {}, token);
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

export function confirmCallerAge(
  token: string,
  input: { termsAccepted: boolean; safetyAccepted: boolean },
): Promise<{
  ok: true;
  minimumAge: number;
  policyVersion: string;
  termsVersion: string;
  safetyProtocolVersion: string;
}> {
  return request('/v1/caller/age-gate', {
    method: 'POST',
    body: JSON.stringify({
      confirmed: true,
      termsAccepted: input.termsAccepted,
      safetyAccepted: input.safetyAccepted,
    }),
  }, token);
}

export function joinCallerWaitlist(
  token: string,
  input: { source?: string; gender?: 'female' | 'male'; preferredLanguageCode?: string },
): Promise<{ ok: true; waitlistEntryId: string }> {
  return request('/v1/caller/waitlist', { method: 'POST', body: JSON.stringify(input) }, token);
}

export function browseListeners(
  token: string,
  input: { languageCode?: string; gender?: 'female' | 'male' | 'any'; limit?: number } = {},
): Promise<{ listeners: BrowseListener[] }> {
  const params = new URLSearchParams();
  if (input.languageCode) params.set('language', input.languageCode);
  if (input.gender && input.gender !== 'any') params.set('gender', input.gender);
  if (input.limit) params.set('limit', String(input.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request(`/v1/listeners${suffix}`, {}, token);
}

export function requestCall(
  token: string,
  input: {
    clientRequestId: string;
    listenerId?: string;
    listenerGender?: 'female' | 'male' | 'any';
    languageCode: string;
    mood?: 'sad' | 'angry' | 'overwhelmed' | 'lonely' | 'just_talk' | 'other';
    topicCode?: string;
    maxSeconds?: number;
  },
): Promise<CallResponse> {
  return request('/v1/calls/request', { method: 'POST', body: JSON.stringify(input) }, token);
}

export function getActiveCall(token: string): Promise<{ activeCall: CallResponse | null }> {
  return request('/v1/calls/active', {}, token);
}

// W58 recording foundation: typed client for the per-call recording consent
// endpoint. NOT yet wired into any live call screen -- the actual pre-call
// recording disclosure UI and the point in the call flow where this gets
// called are part of the follow-up RealtimeKit mobile signaling migration
// (after the W54 live PoC), which this branch intentionally does not touch.
// See docs/W58_RECORDING_CORE_FOUNDATION.md.
export type CallRecordingConsentResponse = {
  ok: true;
  callId: string;
  role: 'caller' | 'listener';
  policyVersion: string;
  bothPartiesConsented: boolean;
};

export type CallRecordingStatusResponse = {
  ok: true;
  callId: string;
  required: boolean;
  policyVersion: string | null;
  callerConsented: boolean;
  listenerConsented: boolean;
};

export function acknowledgeCallRecordingConsent(
  token: string,
  callId: string,
  input: { locale: string; clientVersion?: string },
): Promise<CallRecordingConsentResponse> {
  return request(`/v1/calls/${encodeURIComponent(callId)}/recording-consent`, {
    method: 'POST',
    body: JSON.stringify({ acknowledged: true, locale: input.locale, clientVersion: input.clientVersion ?? null }),
  }, token);
}

export function getCallRecordingStatus(token: string, callId: string): Promise<CallRecordingStatusResponse> {
  return request(`/v1/calls/${encodeURIComponent(callId)}/recording-status`, {}, token);
}

export function dispatchCall(token: string, callId: string): Promise<CallResponse> {
  return request(`/v1/calls/${encodeURIComponent(callId)}/dispatch`, { method: 'POST' }, token);
}

export function getCall(token: string, callId: string): Promise<CallResponse> {
  return request(`/v1/calls/${encodeURIComponent(callId)}`, {}, token);
}

export function cancelCall(token: string, callId: string): Promise<CallResponse> {
  return request(`/v1/calls/${encodeURIComponent(callId)}/cancel`, { method: 'POST' }, token);
}

export function safetyExitCall(
  token: string,
  callId: string,
  input: { details?: string; blockCounterparty?: boolean } = {},
): Promise<SafetyExitResponse> {
  return request(`/v1/calls/${encodeURIComponent(callId)}/safety-exit`, {
    method: 'POST',
    body: JSON.stringify(input),
  }, token);
}

export function reportCallSafety(
  token: string,
  input: { callId: string; category: string; details?: string },
): Promise<{ ok: true; reportId: string }> {
  return request('/v1/safety/report', { method: 'POST', body: JSON.stringify(input) }, token);
}

export function blockCallCounterparty(token: string, callId: string): Promise<{ ok: true; blocked: true }> {
  return request('/v1/safety/block', { method: 'POST', body: JSON.stringify({ callId }) }, token);
}
