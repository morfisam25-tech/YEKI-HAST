import { API_BASE_URL } from './api';

export type InternetVoiceIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type InternetVoiceClientConfig = {
  signalingMode: 'http_polling';
  iceServers: InternetVoiceIceServer[];
  relayConfigured: boolean;
  iranDomesticPath: boolean;
};

export type InternetVoiceSignalKind =
  | 'offer'
  | 'answer'
  | 'ice'
  | 'media_connected'
  | 'reconnecting'
  | 'reconnected';

export type InternetVoiceSignal = {
  id: string;
  createdAt: string;
  kind: InternetVoiceSignalKind;
  senderRole: 'caller' | 'listener';
  payload: unknown;
};

export type InternetVoiceStartResponse = {
  ok: true;
  callId: string;
  status: string;
  transport: 'internet_voice';
  noAnswerSeconds: number;
  client: InternetVoiceClientConfig;
  idempotent: boolean;
};

export type InternetVoiceConfigResponse = {
  callId: string;
  transport: 'internet_voice';
  role: 'caller' | 'listener';
  status: string;
  noAnswerSeconds: number;
  client: InternetVoiceClientConfig;
  readiness: {
    relayConfigured: boolean;
    iranDomesticPathConfigured: boolean;
  };
};

export type InternetVoiceSignalsResponse = {
  callId: string;
  transport: 'internet_voice';
  role: 'caller' | 'listener';
  status: string;
  signals: InternetVoiceSignal[];
};

export type InternetVoiceTiming = {
  elapsedConnectedSeconds: number;
  remainingSeconds: number | null;
  warningThresholdsSeconds: number[];
  warning: string | null;
};

export type InternetVoiceHeartbeatResponse = {
  ok: true;
  callId: string;
  transport: 'internet_voice';
  status: string;
  terminal: boolean;
  capReached: boolean;
  timing: InternetVoiceTiming;
};

export type InternetVoiceEndResponse = {
  ok: true;
  callId: string;
  transport: 'internet_voice';
  status: string;
  billableSeconds?: number;
  callerChargeMinor?: string;
  listenerEarningMinor?: string;
  safetyEventId?: string | null;
  idempotent: boolean;
};

export type InternetVoiceExtendResponse = {
  ok: true;
  callId: string;
  transport: 'internet_voice';
  extensionMinutes: 15 | 30;
  additionalHoldMinor: string;
  authorizedMinor: string;
  maxBillableSeconds: number;
  timing: InternetVoiceTiming;
  idempotent: boolean;
};

class VoiceApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function voiceRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const code = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? String((body as { error: string }).error)
      : 'request_failed';
    throw new VoiceApiError(code, response.status);
  }
  return body as T;
}

export function getInternetVoiceErrorCode(error: unknown): string {
  return error instanceof VoiceApiError ? error.code : 'network_error';
}

export function startInternetVoiceCall(token: string, callId: string): Promise<InternetVoiceStartResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/start`, token, { method: 'POST' });
}

export function getInternetVoiceConfig(token: string, callId: string): Promise<InternetVoiceConfigResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/config`, token);
}

export function getInternetVoiceSignals(token: string, callId: string): Promise<InternetVoiceSignalsResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/signals`, token);
}

export function postInternetVoiceSignal(
  token: string,
  callId: string,
  kind: InternetVoiceSignalKind,
  payload: unknown = null,
): Promise<{ ok: true; status: string; becameConnected: boolean }> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/signals`, token, {
    method: 'POST',
    body: JSON.stringify({ kind, payload }),
  });
}

export function expireInternetVoiceNoAnswer(token: string, callId: string): Promise<{ ok: true; status: 'missed'; idempotent: boolean }> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/no-answer`, token, { method: 'POST' });
}

export function heartbeatInternetVoiceCall(token: string, callId: string): Promise<InternetVoiceHeartbeatResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/heartbeat`, token, { method: 'POST' });
}

export function extendInternetVoiceCall(
  token: string,
  callId: string,
  extensionMinutes: 15 | 30,
  clientRequestId: string,
): Promise<InternetVoiceExtendResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/extend`, token, {
    method: 'POST',
    body: JSON.stringify({ extensionMinutes, clientRequestId }),
  });
}

export function endInternetVoiceCall(
  token: string,
  callId: string,
  reason = 'mobile_user_ended',
): Promise<InternetVoiceEndResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/end`, token, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function safetyExitInternetVoiceCall(
  token: string,
  callId: string,
  input: { details?: string; blockCounterparty?: boolean } = {},
): Promise<InternetVoiceEndResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/safety-exit`, token, {
    method: 'POST',
    body: JSON.stringify({
      reason: 'mobile_safety_exit',
      details: input.details,
      blockCounterparty: input.blockCounterparty === true,
    }),
  });
}
