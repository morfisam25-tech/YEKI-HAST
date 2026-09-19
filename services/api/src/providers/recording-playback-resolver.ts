// W81A — strict, provider-neutral playback resolution boundary.
//
// Update (2026-09-19, re-verified against live current Cloudflare docs): the
// RealtimeKit REST/webhook contract itself is now confirmed (see
// providers/recording-realtimekit.ts getCloudflareRealtimeKitRecordingDetails
// and routes/recording-webhook.ts) -- but that contract only ever gives a
// *transient*, RealtimeKit-hosted download URL, deleted after 7 days
// (developers.cloudflare.com/realtime/realtimekit/recording-guide/, "How
// composite recording works"). This platform's normal retention policy is 30
// days (packages/domain/src/recording.ts, tests/recording-config.test.ts),
// so that transient URL can never be this platform's durable playback
// source -- it would silently stop working long before retention/legal-hold
// requires the recording to still be reviewable.
//
// The real fix is a durable, Listener-owned archive (Cloudflare confirms R2
// -- and AWS S3/Azure/DigitalOcean/GCS -- as supported storage_config
// destinations for RealtimeKit's own transfer-on-upload step; see
// developers.cloudflare.com/realtime/realtimekit/recording-guide/
// custom-cloud-storage/), with an admin playback grant resolving to a
// short-lived *presigned* URL against that archive, never RealtimeKit's own
// transient one. That requires: (1) a real storage_config (bucket +
// credentials) actually provisioned, which this branch deliberately does NOT
// do -- no live Cloudflare/R2 credentials are created here -- and (2) proof
// of the resulting object key format from one real recording, since
// Cloudflare documents `output_file_name` and an optional `path` prefix but
// not a full deterministic key-construction algorithm. Guessing that key
// would be exactly the unverified-provider-behavior this branch must not
// invent. So this interface stays the small, isolated seam a real archive
// resolver plugs into once that live proof exists -- every caller (routes/
// admin-recording.ts) is written against this interface only, never a
// concrete provider, exactly like providers/recording.ts's RecordingProvider
// already is for the record/start/stop lifecycle.

export type PlaybackResolutionResult =
  | { status: 'available'; playbackUrl: string; expiresAt: string }
  | { status: 'unavailable'; reason: string };

// Documents the intended shape of the still-unimplemented durable-archive
// step (Mission B "PRIVATE ARCHIVE CONTRACT" / "R2 PRESIGNED PLAYBACK").
// Nothing in this codebase constructs one of these today -- see this file's
// header comment for exactly what live proof is missing first. Kept here,
// typed but unused, so the eventual implementation has an agreed contract to
// implement against rather than inventing one under time pressure later.
export interface ArchivedRecordingObject {
  // This platform's own durable reference (maps to private_data.
  // call_recording_segments.storage_reference_ciphertext once populated) --
  // deliberately opaque here: whatever it takes to locate the object in
  // Listener-owned storage (bucket + key, or equivalent), never a URL.
  archiveObjectReference: string;
}

export interface PresignedPlaybackIssuer {
  // Must enforce min(remaining playback-grant lifetime, configured TTL) and
  // must never be called before recording_admin + case linkage + reason code
  // + an active playback grant already authorized the request (see routes/
  // admin-recording.ts requestRecordingPlaybackGrant) -- this issuer only
  // ever mints the URL, it does not itself authorize anything. The result is
  // never persisted (not in app.audit_logs metadata, not anywhere else).
  issuePresignedPlaybackUrl(input: {
    archiveObjectReference: string;
    maxTtlSeconds: number;
  }): Promise<{ playbackUrl: string; expiresAt: string }>;
}

export interface PlaybackResolveInput {
  recordingSessionId: string;
  provider: string;
  providerMeetingId: string | null;
  providerRecordingId: string | null;
  ttlSeconds: number;
}

export interface PlaybackResolver {
  readonly name: string;

  // Must fail closed: any missing information, provider error, or unverified
  // capability returns { status: 'unavailable', reason } rather than throwing
  // a raw provider error up to the HTTP layer or fabricating a URL. Never
  // returns a long-lived provider token/secret or an unrestricted URL --
  // `playbackUrl` here must always be short-lived and scoped to exactly the
  // one recording session it was resolved for.
  resolvePlayback(input: PlaybackResolveInput): Promise<PlaybackResolutionResult>;
}

export class PlaybackResolverError extends Error {
  public code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

let cachedResolver: PlaybackResolver | undefined;
let cachedResolverName: string | undefined;

export async function getPlaybackResolver(providerName: string): Promise<PlaybackResolver> {
  if (cachedResolver && cachedResolverName === providerName) return cachedResolver;

  if (providerName === 'cloudflare_realtimekit') {
    const { createCloudflareRealtimeKitPlaybackResolver } = await import('./recording-playback-resolver-realtimekit.ts');
    cachedResolver = createCloudflareRealtimeKitPlaybackResolver();
    cachedResolverName = providerName;
    return cachedResolver;
  }

  throw new PlaybackResolverError('playback_resolver_not_supported', `Unsupported playback resolver provider: "${providerName}"`);
}

// Test-only: mirrors providers/recording.ts's __resetRecordingProviderCacheForTests.
export function __resetPlaybackResolverCacheForTests(): void {
  cachedResolver = undefined;
  cachedResolverName = undefined;
}
