export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://yeki-hast-theta.vercel.app').replace(/\/$/, '');

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
    platformGrossSpreadPerMinute: number;
    billingIncrementSeconds: number;
    displayUnit: string;
    displayDivisor: number;
  };
  features?: {
    callerClosedBetaEnabled?: boolean;
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

export type ListenerEarningsResponse = {
  availableMinor: number;
  pendingMinor: number;
  currencyCode: string;
  displayUnit: string;
  displayDivisor: number;
  recent: Array<{
    id: string;
    amountMinor: number;
    status: 'pending' | 'available' | 'paid' | 'reversed';
    sourceType: 'call' | 'guarantee';
    createdAt: string;
  }>;
};

export type CallerWalletResponse = {
  availableMinor: number;
  heldMinor: number;
  currencyCode: string;
  displayUnit: string;
  displayDivisor: number;
};

export type CallerRecentCall = {
  id: string;
  listenerNickname: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  callerChargedMinor: number | null;
  currencyCode: string;
  displayUnit: string;
  displayDivisor: number;
  canRate: boolean;
  canReport: boolean;
};

export type ListenerActiveCallResponse = {
  id: string;
  status: string;
  callerUserId: string;
  startedAt: string | null;
  durationSeconds: number | null;
  callerRatePerMinuteMinor: number;
  listenerRatePerMinuteMinor: number;
  currencyCode: string;
  displayUnit: string;
  displayDivisor: number;
};

export function normalizeIranPhone(raw: string): string {
  const value = raw.replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(value)) return `+98${value.slice(1)}`;
  if (/^\+989\d{9}$/.test(value)) return value;
  throw new Error('invalid_phone');
}

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `http_${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export function getBootstrap() {
  return api<BootstrapResponse>('/v1/bootstrap');
}

export function requestOtp(phone: string) {
  return api<{ ok: true; expiresInSeconds: number }>('/v1/auth/request', {
    method: 'POST',
    body: JSON.stringify({ phone: normalizeIranPhone(phone) }),
  });
}

export function verifyOtp(phone: string, code: string) {
  return api<SessionResponse>('/v1/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ phone: normalizeIranPhone(phone), code }),
  });
}

export function getSession(token: string) {
  return api<{ authenticated: boolean; userId?: string; roles?: string[] }>('/v1/auth/session', {}, token);
}

export function getListenerApplication(token: string) {
  return api<ListenerApplicationResponse>('/v1/listener/application', {}, token);
}

export function submitListenerApplication(token: string, body: {
  nickname: string;
  declaredGender: 'female' | 'male';
  languages: Array<{ code: string; proficiency: string }>;
  shortIntro?: string;
  listeningStyle?: string;
}) {
  return api<ListenerApplicationResponse>('/v1/listener/application', {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

export function updateListenerTraining(token: string, moduleKey: ListenerTrainingModuleKey, progressPercent: number) {
  return api('/v1/listener/training', {
    method: 'POST',
    body: JSON.stringify({ moduleKey, progressPercent }),
  }, token);
}

export function submitListenerAssessment(token: string, answers: Array<{ questionKey: string; answer: string }>) {
  return api('/v1/listener/assessment', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  }, token);
}

export function getListenerKyc(token: string) {
  return api<ListenerKycStatusResponse>('/v1/listener/kyc', {}, token);
}

export function submitListenerKyc(token: string, body: {
  nationalId: string;
  birthDateJalali: string;
  firstName: string;
  lastName: string;
  iban?: string;
}) {
  return api<ListenerKycStatusResponse>('/v1/listener/kyc', {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

export function getListenerPresence(token: string) {
  return api<ListenerPresenceResponse>('/v1/listener/presence', {}, token);
}

export function updateListenerPresence(token: string, body: {
  status: 'online' | 'offline' | 'paused';
  acceptsMale: boolean;
  acceptsFemale: boolean;
}) {
  return api<ListenerPresenceResponse>('/v1/listener/presence', {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

export function heartbeatListener(token: string) {
  return api('/v1/listener/presence/heartbeat', { method: 'POST', body: '{}' }, token);
}

export function getListenerEarnings(token: string) {
  return api<ListenerEarningsResponse>('/v1/listener/earnings', {}, token);
}

export function getListenerActiveCall(token: string) {
  return api<ListenerActiveCallResponse | { active: false }>('/v1/listener/calls/active', {}, token);
}

export function getCallerWallet(token: string) {
  return api<CallerWalletResponse>('/v1/wallet', {}, token);
}

export function getCallerRecentCalls(token: string) {
  return api<{ calls: CallerRecentCall[] }>('/v1/caller/calls/recent', {}, token);
}

export function cancelCallerCall(token: string, callId: string) {
  return api(`/v1/calls/${encodeURIComponent(callId)}/cancel`, { method: 'POST', body: '{}' }, token);
}

export function submitCallRating(token: string, callId: string, score: number) {
  return api(`/v1/calls/${encodeURIComponent(callId)}/rating`, {
    method: 'POST',
    body: JSON.stringify({ score }),
  }, token);
}

export function submitCallReport(token: string, callId: string, category: string, description?: string) {
  return api(`/v1/calls/${encodeURIComponent(callId)}/report`, {
    method: 'POST',
    body: JSON.stringify({ category, description }),
  }, token);
}
