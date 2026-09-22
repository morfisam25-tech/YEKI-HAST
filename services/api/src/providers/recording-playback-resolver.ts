export type PlaybackResolutionResult =
  | { status: 'available'; playbackUrl: string; expiresAt: string }
  | { status: 'unavailable'; reason: string };

export interface ArchivedRecordingObject {
  archiveObjectReference: string;
}

export interface PresignedPlaybackIssuer {
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
  // The database grant is the authorization boundary. Resolvers must never
  // mint a URL beyond this timestamp even when configured TTL is longer.
  grantExpiresAt: string;
}

export interface PlaybackResolver {
  readonly name: string;
  resolvePlayback(input: PlaybackResolveInput): Promise<PlaybackResolutionResult>;
}

export class PlaybackResolverError extends Error {
  public code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

export function capPlaybackTtlSeconds(input: {
  configuredTtlSeconds: number;
  grantExpiresAt: string;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const expiresAt = new Date(input.grantExpiresAt);
  if (!Number.isFinite(expiresAt.getTime())) return 0;
  const remaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1_000);
  if (remaining <= 0) return 0;
  return Math.max(1, Math.min(input.configuredTtlSeconds, remaining));
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

  throw new PlaybackResolverError(
    'playback_resolver_not_supported',
    `Unsupported playback resolver provider: "${providerName}"`,
  );
}

export function __resetPlaybackResolverCacheForTests(): void {
  cachedResolver = undefined;
  cachedResolverName = undefined;
}
