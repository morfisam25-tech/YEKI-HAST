export const WAVE1_SESSION_CAP_SECONDS = [600, 1_800, 3_600] as const;
export const INTERNET_VOICE_EXTENSION_SECONDS = [900, 1_800] as const;
export const SESSION_WARNING_THRESHOLDS_SECONDS = [120, 60] as const;

export type Wave1SessionCapSeconds = (typeof WAVE1_SESSION_CAP_SECONDS)[number];
export type InternetVoiceExtensionSeconds = (typeof INTERNET_VOICE_EXTENSION_SECONDS)[number];

export function isWave1SessionCapSeconds(value: number): value is Wave1SessionCapSeconds {
  return WAVE1_SESSION_CAP_SECONDS.includes(value as Wave1SessionCapSeconds);
}

export function isInternetVoiceExtensionSeconds(value: number): value is InternetVoiceExtensionSeconds {
  return INTERNET_VOICE_EXTENSION_SECONDS.includes(value as InternetVoiceExtensionSeconds);
}

export function requireWave1SessionCapSeconds(value: unknown): Wave1SessionCapSeconds {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !isWave1SessionCapSeconds(parsed)) {
    throw new Error('invalid_wave1_session_cap');
  }
  return parsed;
}

export function requireInternetVoiceExtensionSeconds(value: unknown): InternetVoiceExtensionSeconds {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !isInternetVoiceExtensionSeconds(parsed)) {
    throw new Error('invalid_internet_voice_extension');
  }
  return parsed;
}

export function authorizationMinorForSeconds(
  callerRatePerMinuteMinor: bigint,
  seconds: number,
): bigint {
  if (callerRatePerMinuteMinor <= 0n) throw new Error('caller_rate_invalid');
  if (!Number.isInteger(seconds) || seconds < 1) throw new Error('seconds_invalid');
  return (callerRatePerMinuteMinor * BigInt(seconds) + 59n) / 60n;
}

export function sessionTiming(input: {
  status: string;
  connectedAt: string | null;
  maxBillableSeconds: number | null;
  nowMs?: number;
}) {
  const maxBillableSeconds = input.maxBillableSeconds;
  if (!maxBillableSeconds || maxBillableSeconds < 1) {
    return {
      elapsedConnectedSeconds: 0,
      remainingSeconds: null,
      warningThresholdsSeconds: [...SESSION_WARNING_THRESHOLDS_SECONDS],
      warning: null as 120 | 60 | null,
    };
  }

  if (input.status !== 'connected' || !input.connectedAt) {
    return {
      elapsedConnectedSeconds: 0,
      remainingSeconds: maxBillableSeconds,
      warningThresholdsSeconds: [...SESSION_WARNING_THRESHOLDS_SECONDS],
      warning: null as 120 | 60 | null,
    };
  }

  const connectedMs = Date.parse(input.connectedAt);
  if (!Number.isFinite(connectedMs)) throw new Error('connected_at_invalid');
  const nowMs = input.nowMs ?? Date.now();
  const elapsedConnectedSeconds = Math.max(0, Math.floor((nowMs - connectedMs) / 1_000));
  const remainingSeconds = Math.max(0, maxBillableSeconds - elapsedConnectedSeconds);
  const warning: 120 | 60 | null = remainingSeconds <= 60
    ? 60
    : remainingSeconds <= 120
      ? 120
      : null;

  return {
    elapsedConnectedSeconds,
    remainingSeconds,
    warningThresholdsSeconds: [...SESSION_WARNING_THRESHOLDS_SECONDS],
    warning,
  };
}
