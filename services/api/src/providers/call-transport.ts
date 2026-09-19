import { validateTelephonyEnv } from './telephony.ts';
import { currentCallMediaProvider, realtimeKitVoicePresetName } from '../lib/call-media-config.ts';
import { currentRecordingPolicy, resolveRecordingEnvironment } from '../lib/recording-config.ts';
import { requireCloudflareRealtimeKitConfig } from './recording-realtimekit.ts';

export type CallTransportKind = 'internet_voice' | 'masked_pstn';
export type InternetVoiceCredentialMode = 'none' | 'static' | 'cloudflare_short_lived';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type InternetVoiceClientConfig = {
  signalingMode: 'http_polling';
  iceServers: IceServerConfig[];
  relayConfigured: boolean;
  iranDomesticPath: boolean;
};

export type CallTransportReadiness = {
  primary: CallTransportKind;
  fallback: CallTransportKind | null;
  internetVoice: {
    configured: boolean;
    relayConfigured: boolean;
    signalingMode: 'http_polling';
    credentialMode: InternetVoiceCredentialMode;
    iceServers: IceServerConfig[];
    iranDomesticPathConfigured: boolean;
    iranIceServers: IceServerConfig[];
    iranControlPlaneBaseUrl: string | null;
  };
  maskedPstn: {
    configured: boolean;
  };
};

type CloudflareTurnConfig = {
  keyId: string;
  apiToken: string;
  ttlSeconds: number;
};

const CLOUDFLARE_TURN_BASE_URL = 'https://rtc.live.cloudflare.com/v1/turn/keys';
const CLOUDFLARE_TURN_DEFAULT_TTL_SECONDS = 14_400;
const CLOUDFLARE_TURN_MAX_TTL_SECONDS = 172_800;
const CLOUDFLARE_TURN_REQUEST_TIMEOUT_MS = 5_000;

function readTransport(value: string | undefined, fallback: CallTransportKind): CallTransportKind {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'internet_voice' || normalized === 'masked_pstn') return normalized;
  throw new Error('invalid_call_transport');
}

function readFallbackTransport(value: string | undefined): CallTransportKind | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'none') return null;
  if (normalized === 'internet_voice' || normalized === 'masked_pstn') return normalized;
  throw new Error('invalid_call_fallback_transport');
}

function isPublicHttpsUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function normalizeUrls(value: unknown): string | string[] {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const urls = value.map((item) => String(item).trim()).filter(Boolean);
    if (urls.length) return urls;
  }
  throw new Error('invalid_internet_voice_ice_servers');
}

export function parseIceServers(value: string | undefined): IceServerConfig[] {
  const raw = value?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid_internet_voice_ice_servers');
  }
  if (!Array.isArray(parsed) || parsed.length > 16) throw new Error('invalid_internet_voice_ice_servers');
  return parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid_internet_voice_ice_servers');
    const record = entry as Record<string, unknown>;
    const urls = normalizeUrls(record.urls);
    const username = record.username === undefined ? undefined : String(record.username).trim();
    const credential = record.credential === undefined ? undefined : String(record.credential);
    if ((username && !credential) || (!username && credential)) throw new Error('invalid_internet_voice_ice_servers');
    return {
      urls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    };
  });
}

function hasTurnRelay(servers: IceServerConfig[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => /^turns?:/i.test(url));
  });
}

function readCloudflareTurnConfig(): CloudflareTurnConfig | null {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim() ?? '';
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim() ?? '';
  if (!keyId && !apiToken) return null;
  if (!keyId || !apiToken) throw new Error('invalid_cloudflare_turn_config');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(keyId)) throw new Error('invalid_cloudflare_turn_config');

  const rawTtl = process.env.CLOUDFLARE_TURN_TTL_SECONDS?.trim();
  const ttlSeconds = rawTtl ? Number(rawTtl) : CLOUDFLARE_TURN_DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > CLOUDFLARE_TURN_MAX_TTL_SECONDS) {
    throw new Error('invalid_cloudflare_turn_ttl');
  }
  return { keyId, apiToken, ttlSeconds };
}

function getInternetVoiceCredentialMode(staticIceServers: IceServerConfig[]): InternetVoiceCredentialMode {
  if (readCloudflareTurnConfig()) return 'cloudflare_short_lived';
  return staticIceServers.length > 0 ? 'static' : 'none';
}

async function generateCloudflareIceServers(config: CloudflareTurnConfig): Promise<IceServerConfig[]> {
  const endpoint = `${CLOUDFLARE_TURN_BASE_URL}/${encodeURIComponent(config.keyId)}/credentials/generate-ice-servers`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ttl: config.ttlSeconds }),
      signal: AbortSignal.timeout(CLOUDFLARE_TURN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('cloudflare_turn_credentials_unavailable');
  }
  if (response.status !== 201) throw new Error('cloudflare_turn_credentials_unavailable');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('cloudflare_turn_credentials_unavailable');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('cloudflare_turn_credentials_unavailable');
  }
  const iceServers = parseIceServers(JSON.stringify((payload as Record<string, unknown>).iceServers));
  if (!iceServers.length || !hasTurnRelay(iceServers)) {
    throw new Error('cloudflare_turn_credentials_unavailable');
  }
  return iceServers;
}

function isMaskedPstnConfigured(): boolean {
  try {
    validateTelephonyEnv();
    return true;
  } catch {
    return false;
  }
}

export function getCallTransportReadiness(): CallTransportReadiness {
  const primary = readTransport(process.env.CALL_PRIMARY_TRANSPORT, 'internet_voice');
  // PSTN is an explicit operational fallback, never an implicit launch dependency.
  const fallback = readFallbackTransport(process.env.CALL_FALLBACK_TRANSPORT ?? 'none');
  const iceServers = parseIceServers(process.env.INTERNET_VOICE_ICE_SERVERS_JSON);
  const credentialMode = getInternetVoiceCredentialMode(iceServers);
  const cloudflareConfigured = credentialMode === 'cloudflare_short_lived';
  const iranIceServers = parseIceServers(process.env.INTERNET_VOICE_IRAN_ICE_SERVERS_JSON);
  const iranControlPlaneBaseUrl = isPublicHttpsUrl(process.env.INTERNET_VOICE_IRAN_CONTROL_PLANE_BASE_URL);

  return {
    primary,
    fallback: fallback === primary ? null : fallback,
    internetVoice: {
      configured: cloudflareConfigured || iceServers.length > 0,
      relayConfigured: cloudflareConfigured || hasTurnRelay(iceServers),
      signalingMode: 'http_polling',
      credentialMode,
      iceServers,
      iranDomesticPathConfigured: iranIceServers.length > 0 && hasTurnRelay(iranIceServers) && Boolean(iranControlPlaneBaseUrl),
      iranIceServers,
      iranControlPlaneBaseUrl,
    },
    maskedPstn: {
      configured: isMaskedPstnConfigured(),
    },
  };
}

export function validatePrimaryCallTransportEnv(): void {
  const readiness = getCallTransportReadiness();
  if (readiness.primary === 'masked_pstn') {
    validateTelephonyEnv();
    return;
  }

  // Local development may exercise signaling/state logic without a relay. Any real
  // deployment (Preview or Production -- Vercel sets NODE_ENV=production for both)
  // must have a working call-media path configured end to end.
  if (process.env.NODE_ENV !== 'production') return;

  // RealtimeKit owns signaling/media relay on this path: it must never be held to the
  // legacy TURN/static-ICE contract, which it doesn't use and can't satisfy meaningfully.
  // legacy_p2p is the only path that still relies on this module's own TURN relay.
  if (currentCallMediaProvider() === 'realtimekit') {
    requireCloudflareRealtimeKitConfig();
    realtimeKitVoicePresetName();
    // Recording is a separate, independently fail-closed requirement (see
    // packages/domain/src/recording.ts) -- only enforced for real Production,
    // since Preview may still run the explicit CALL_RECORDING_REQUIRED=false
    // technical-beta exception even while using realtimekit for media.
    if (resolveRecordingEnvironment() === 'production') currentRecordingPolicy();
    return;
  }

  if (!readiness.internetVoice.configured) throw new Error('internet_voice_not_configured');
  if (!readiness.internetVoice.relayConfigured) throw new Error('internet_voice_turn_required');
}

export async function getInternetVoiceClientConfig(input?: { iranDomestic?: boolean }): Promise<InternetVoiceClientConfig> {
  const readiness = getCallTransportReadiness();
  const useIranDomestic = Boolean(input?.iranDomestic && readiness.internetVoice.iranDomesticPathConfigured);
  if (useIranDomestic) {
    return {
      signalingMode: 'http_polling',
      iceServers: readiness.internetVoice.iranIceServers,
      relayConfigured: hasTurnRelay(readiness.internetVoice.iranIceServers),
      iranDomesticPath: true,
    };
  }

  const cloudflare = readCloudflareTurnConfig();
  const iceServers = cloudflare
    ? await generateCloudflareIceServers(cloudflare)
    : readiness.internetVoice.iceServers;
  return {
    signalingMode: 'http_polling',
    iceServers,
    relayConfigured: hasTurnRelay(iceServers),
    iranDomesticPath: false,
  };
}
