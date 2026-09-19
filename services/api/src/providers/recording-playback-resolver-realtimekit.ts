import type { PlaybackResolutionResult, PlaybackResolver } from './recording-playback-resolver.ts';

// Cloudflare RealtimeKit playback resolver: deliberately fails closed today.
//
// See recording-playback-resolver.ts's header for the full (re-verified
// 2026-09-19) investigation. Summary: this repo now DOES capture real
// recording-output metadata (routes/recording-webhook.ts writes a
// private_data.call_recording_segments row from the verified
// recording.statusUpdate webhook payload), but storage_reference_ciphertext
// -- this platform's own durable archive reference -- is deliberately left
// NULL there, because no durable archive exists yet: RealtimeKit's own
// download URL is confirmed transient (7-day retention, shorter than this
// platform's 30-day normal retention), and no real storage_config (R2/S3/
// Azure/GCS bucket + credentials) has been provisioned in this environment.
// Returning a fixed 'unavailable' result here -- instead of proxying that
// transient URL as if it were durable, or guessing an object key inside a
// bucket that may not even be configured -- is the fail-closed behavior
// W81A requires.
//
// A future implementation would: resolve `archiveObjectReference` from the
// segment row (once a real archive step populates it) and call a
// PresignedPlaybackIssuer (see recording-playback-resolver.ts) against real
// storage credentials. That replaces only this file's resolvePlayback body;
// the interface and every caller (routes/admin-recording.ts) stay unchanged.
export function createCloudflareRealtimeKitPlaybackResolver(): PlaybackResolver {
  return {
    name: 'cloudflare_realtimekit',

    async resolvePlayback(): Promise<PlaybackResolutionResult> {
      return { status: 'unavailable', reason: 'archival_storage_not_provisioned' };
    },
  };
}
