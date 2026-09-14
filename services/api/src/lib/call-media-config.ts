import { resolveCallMediaProvider, type CallMediaProvider } from '../../../../packages/domain/src/call-media.ts';
import { resolveRecordingEnvironment } from './recording-config.ts';

// Same VERCEL_ENV/APP_ENV signal recording-config.ts (W58) and W57's
// resolveAppEnv() already rely on -- reused, not re-derived, so this
// inherits the same proven fail-closed environment detection.
export function currentCallMediaProvider(): CallMediaProvider {
  return resolveCallMediaProvider({
    environment: resolveRecordingEnvironment(),
    explicitProvider: process.env.CALL_MEDIA_PROVIDER?.trim() || null,
  });
}

// The RealtimeKit Preset (developers.cloudflare.com/realtime/realtimekit/audio-calls/)
// every call participant joins under. Audio-only behavior (no video/camera) is
// enforced by this Preset's "Voice" meeting type on Cloudflare's side, not by a
// client-side flag -- Preset creation/configuration happens in the Cloudflare
// dashboard/account, not in this codebase (see docs/W60 report, "remaining
// live W54 steps"). Required whenever the RealtimeKit media path is used.
export function realtimeKitVoicePresetName(): string {
  const raw = process.env.CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME?.trim();
  if (!raw) throw new Error('CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME not configured');
  return raw;
}
