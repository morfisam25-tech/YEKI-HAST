import {
  decryptRecordingArchiveReference,
  issueR2PresignedPlaybackUrl,
  r2ArchiveObjectExists,
  requireR2ArchiveConfig,
  RecordingArchiveError,
} from '../lib/recording-archive-r2.ts';
import { loadRecordingArchiveReference } from '../services/recording-archive.ts';
import {
  capPlaybackTtlSeconds,
  type PlaybackResolutionResult,
  type PlaybackResolver,
} from './recording-playback-resolver.ts';

export function createCloudflareRealtimeKitPlaybackResolver(): PlaybackResolver {
  return {
    name: 'cloudflare_realtimekit',

    async resolvePlayback(input): Promise<PlaybackResolutionResult> {
      if (!input.providerRecordingId) {
        return { status: 'unavailable', reason: 'provider_recording_id_missing' };
      }

      const ttlSeconds = capPlaybackTtlSeconds({
        configuredTtlSeconds: input.ttlSeconds,
        grantExpiresAt: input.grantExpiresAt,
      });
      if (ttlSeconds <= 0) {
        return { status: 'unavailable', reason: 'playback_grant_expired' };
      }

      try {
        const config = requireR2ArchiveConfig();
        const reference = await loadRecordingArchiveReference({
          recordingSessionId: input.recordingSessionId,
          providerRecordingId: input.providerRecordingId,
        });
        if (!reference) {
          return { status: 'unavailable', reason: 'archive_object_missing' };
        }
        if (reference.bucket !== config.bucket) {
          return { status: 'unavailable', reason: 'archive_bucket_mismatch' };
        }

        // Re-check existence at issuance time. A stale DB reference never
        // becomes a bearer URL to a nonexistent/wrong object.
        const exists = await r2ArchiveObjectExists(reference.key, config);
        if (!exists) {
          return { status: 'unavailable', reason: 'archive_object_missing' };
        }

        const signed = issueR2PresignedPlaybackUrl({
          key: reference.key,
          ttlSeconds,
          config,
        });
        return { status: 'available', playbackUrl: signed.playbackUrl, expiresAt: signed.expiresAt };
      } catch (error) {
        if (error instanceof RecordingArchiveError) {
          return { status: 'unavailable', reason: error.code };
        }
        return { status: 'unavailable', reason: 'playback_resolution_failed' };
      }
    },
  };
}

// Kept exported for tests that verify ciphertext cannot be confused with a
// plaintext object reference. Runtime callers use loadRecordingArchiveReference.
export { decryptRecordingArchiveReference };
