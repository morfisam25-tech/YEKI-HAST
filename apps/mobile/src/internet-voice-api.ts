import type { RTCIceCandidate, RTCPeerConnection } from '@cloudflare/react-native-webrtc';
import { API_BASE_URL } from './api';

// LEGACY_P2P_PREVIEW_ONLY: @cloudflare/react-native-webrtc's RTCPeerConnection
// extends EventTarget from its own nested event-target-shim@6 dependency,
// while this workspace also hoists event-target-shim@5 at the root (a
// pre-existing React Native ecosystem duplicate-version situation, not
// something this branch introduced). TypeScript's module resolution for this
// workspace picks up the wrong EventTarget generic for that base class, so
// `RTCPeerConnection` alone does not type-check addEventListener even though
// it exists and works at runtime (verified against the package's own
// RTCPeerConnection.d.ts, which declares exactly these two events). This
// narrow, explicit intersection type is scoped to only the two events the
// legacy P2P path actually listens for.
export type PeerConnectionWithLegacyEvents = RTCPeerConnection & {
  addEventListener(type: 'icecandidate', listener: (event: { candidate: RTCIceCandidate | null }) => void): void;
  addEventListener(type: 'connectionstatechange', listener: () => void): void;
};

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

// W60: which live-media transport this call actually uses. 'realtimekit' is
// the RealtimeKit mobile media migration path (this branch); 'legacy_p2p' is
// the pre-W60 react-native-webrtc/custom offer-answer/ICE-polling path, kept
// working only for the Internal Preview technical-beta transport-mode
// (task section 9) until it is fully retired. `client` (legacy ICE/TURN
// config) is only present for 'legacy_p2p' -- a 'realtimekit' call instead
// calls getInternetVoiceMediaAuth() for its RealtimeKit join token.
export type CallMediaProvider = 'realtimekit' | 'legacy_p2p';

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
  mediaProvider: CallMediaProvider;
  noAnswerSeconds: number;
  client: InternetVoiceClientConfig | null;
  idempotent: boolean;
};

export type InternetVoiceConfigResponse = {
  callId: string;
  transport: 'internet_voice';
  role: 'caller' | 'listener';
  status: string;
  mediaProvider: CallMediaProvider;
  noAnswerSeconds: number;
  client: InternetVoiceClientConfig | null;
  readiness: {
    relayConfigured: boolean;
    iranDomesticPathConfigured: boolean;
  };
};

export type InternetVoiceMediaAuthResponse = {
  ok: true;
  callId: string;
  role: 'caller' | 'listener';
  provider: 'realtimekit';
  meetingId: string;
  authToken: string;
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

// W60: mints a short-lived RealtimeKit participant auth token for this exact
// call. Server-derives the caller's role from the call row itself -- there is
// no client-supplied role/identity in the request. Call this once per join
// attempt (initial join and each reconnect); the server does not cache or
// reuse a prior token, so a fresh one is minted every time.
export function getInternetVoiceMediaAuth(token: string, callId: string): Promise<InternetVoiceMediaAuthResponse> {
  return voiceRequest(`/v1/calls/${encodeURIComponent(callId)}/voice/media-auth`, token, { method: 'POST' });
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
