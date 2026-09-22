import type { RecordingState } from '../../../../packages/domain/src/recording.ts';

// Provider-agnostic contract. The orchestrator talks to this interface only.
export interface RecordingSessionHandle {
  providerMeetingId: string;
}

export interface RecordingStartResult {
  providerRecordingId: string;
  providerStatus: string;
}

export interface RecordingStatusResult {
  providerStatus: string;
  startedAt: string | null;
  endedAt: string | null;
  failureCode: string | null;
}

export interface RecordingStopResult {
  providerStatus: string;
}

export interface RecordingProvider {
  readonly name: string;

  prepareSession(input: { callSessionId: string }): Promise<RecordingSessionHandle>;

  startRecording(input: {
    providerMeetingId: string;
    maxSeconds: number;
  }): Promise<RecordingStartResult>;

  getRecordingStatus(input: {
    providerMeetingId: string;
    providerRecordingId: string;
  }): Promise<RecordingStatusResult>;

  stopRecording(input: {
    providerMeetingId: string;
    providerRecordingId: string;
  }): Promise<RecordingStopResult>;

  normalizeStatus(providerStatus: string): RecordingState;
}

export class RecordingProviderError extends Error {
  public code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

let cachedProvider: RecordingProvider | undefined;
let cachedProviderName: string | undefined;

export async function getRecordingProvider(providerName: string): Promise<RecordingProvider> {
  if (cachedProvider && cachedProviderName === providerName) return cachedProvider;

  if (providerName === 'cloudflare_realtimekit') {
    // W88 archive wrapper is a no-op unless CALL_RECORDING_ARCHIVE_R2_ENABLED
    // is explicitly configured. This keeps local/non-archive behavior identical
    // while letting Preview pass a per-recording Cloudflare R2 storage_config.
    const { createCloudflareRealtimeKitArchiveProvider } = await import('./recording-realtimekit-archive.ts');
    cachedProvider = createCloudflareRealtimeKitArchiveProvider();
    cachedProviderName = providerName;
    return cachedProvider;
  }

  throw new RecordingProviderError('recording_provider_not_supported', `Unsupported CALL_RECORDING_PROVIDER: "${providerName}"`);
}

export function __resetRecordingProviderCacheForTests(): void {
  cachedProvider = undefined;
  cachedProviderName = undefined;
}
