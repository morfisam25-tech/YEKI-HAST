import { resolveRecordingRequirement, type RecordingPolicy } from '../../../../packages/domain/src/recording.ts';

export type RecordingEnvironment = 'production' | 'preview_internal_beta' | 'local';

// Same platform signal internal-owner-test.ts (W25) and the W57 apps/web|admin
// _env.ts resolveAppEnv() already rely on: VERCEL_ENV is set correctly and
// distinctly by the platform for every deployment type, unlike NODE_ENV (which
// Vercel sets to 'production' for Preview builds too).
export function resolveRecordingEnvironment(): RecordingEnvironment {
  const explicit = process.env.APP_ENV?.trim().toLowerCase();
  if (explicit) {
    if (explicit === 'production' || explicit === 'preview_internal_beta' || explicit === 'local') {
      return explicit;
    }
    throw new Error(`APP_ENV has an unrecognized value for recording policy: "${explicit}"`);
  }
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview_internal_beta';
  return 'local';
}

function readBooleanFlag(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === '') return null;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error('CALL_RECORDING_REQUIRED must be true or false');
}

// Cached per-process: env vars do not change mid-request, and every call site
// that needs the policy calls this multiple times per request.
export function currentRecordingPolicy(): RecordingPolicy {
  return resolveRecordingRequirement({
    environment: resolveRecordingEnvironment(),
    recordingRequiredFlag: readBooleanFlag(process.env.CALL_RECORDING_REQUIRED),
    provider: process.env.CALL_RECORDING_PROVIDER?.trim() || null,
    policyVersion: process.env.CALL_RECORDING_CONSENT_POLICY_VERSION?.trim() || null,
  });
}

export function recordingRetentionDays(): number {
  const raw = process.env.CALL_RECORDING_RETENTION_DAYS?.trim();
  const value = raw ? Number(raw) : 90;
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error('CALL_RECORDING_RETENTION_DAYS must be an integer between 1 and 3650');
  }
  return value;
}

export function recordingPlaybackGrantTtlSeconds(): number {
  const raw = process.env.CALL_RECORDING_PLAYBACK_TTL_SECONDS?.trim();
  const value = raw ? Number(raw) : 300;
  if (!Number.isInteger(value) || value < 30 || value > 3600) {
    throw new Error('CALL_RECORDING_PLAYBACK_TTL_SECONDS must be an integer between 30 and 3600');
  }
  return value;
}
