import { validateTelephonyEnv } from './telephony.ts';

export type CallTransportKind = 'internet_voice' | 'masked_pstn';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type CallTransportReadiness = {
  primary: CallTransportKind;
  fallback: CallTransportKind | null;
  internetVoice: {
    configured: boolean;
    relayConfigured: boolean;
    signalingMode: 'http_polling';
    iceServers: IceServerConfig[];
    iranDomesticPathConfigured: boolean;
    iranIceServers: IceServerConfig[];
    iranControlPlaneBaseUrl: string | null;
  };
  maskedPstn: {
    configured: boolean;
  };
};

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
  const fallback = readFallbackTransport(process.env.CALL_FALLBACK_TRANSPORT ?? 'masked_pstn');
  const iceServers = parseIceServers(process.env.INTERNET_VOICE_ICE_SERVERS_JSON);
  const iranIceServers = parseIceServers(process.env.INTERNET_VOICE_IRAN_ICE_SERVERS_JSON);
  const iranControlPlaneBaseUrl = isPublicHttpsUrl(process.env.INTERNET_VOICE_IRAN_CONTROL_PLANE_BASE_URL);

  return {
    primary,
    fallback: fallback === primary ? null : fallback,
    internetVoice: {
      configured: iceServers.length > 0,
      relayConfigured: hasTurnRelay(iceServers),
      signalingMode: 'http_polling',
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

  // Local development may exercise signaling/state logic without a relay. Public production
  // must have a TURN relay because direct peer-to-peer connectivity is not reliable enough
  // to be treated as an operational launch transport.
  if (process.env.NODE_ENV === 'production') {
    if (!readiness.internetVoice.configured) throw new Error('internet_voice_not_configured');
    if (!readiness.internetVoice.relayConfigured) throw new Error('internet_voice_turn_required');
  }
}

export function getInternetVoiceClientConfig(input?: { iranDomestic?: boolean }): {
  signalingMode: 'http_polling';
  iceServers: IceServerConfig[];
  relayConfigured: boolean;
  iranDomesticPath: boolean;
} {
  const readiness = getCallTransportReadiness();
  const useIranDomestic = Boolean(input?.iranDomestic && readiness.internetVoice.iranDomesticPathConfigured);
  const iceServers = useIranDomestic ? readiness.internetVoice.iranIceServers : readiness.internetVoice.iceServers;
  return {
    signalingMode: 'http_polling',
    iceServers,
    relayConfigured: hasTurnRelay(iceServers),
    iranDomesticPath: useIranDomestic,
  };
}
