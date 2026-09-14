import type { RecordingState } from '../../../../packages/domain/src/recording.ts';

// Provider-agnostic contract. The orchestrator (services/api/src/services/
// recording-lifecycle.ts) talks to this interface only; it never imports a
// concrete adapter directly. This is what the eventual RealtimeKit mobile
// media migration (out of scope for W58) plugs into without touching the
// orchestrator, billing gate, consent model, or admin/evidence code.

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

  // Create (or reuse) the provider-side session/meeting a recording attaches
  // to. Does not itself start recording -- callers of this interface decide
  // when to move from 'ready' to 'starting'.
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

  // Maps this provider's own status vocabulary onto the platform's
  // provider-agnostic app.recording_state. Kept on the adapter (not the
  // orchestrator) because only the adapter knows its own provider's enum.
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

// Lazily imports the concrete adapter so a deployment that never configures
// CALL_RECORDING_PROVIDER never has to load/validate it.
export async function getRecordingProvider(providerName: string): Promise<RecordingProvider> {
  if (cachedProvider && cachedProviderName === providerName) return cachedProvider;

  if (providerName === 'cloudflare_realtimekit') {
    const { createCloudflareRealtimeKitProvider } = await import('./recording-realtimekit.ts');
    cachedProvider = createCloudflareRealtimeKitProvider();
    cachedProviderName = providerName;
    return cachedProvider;
  }

  throw new RecordingProviderError('recording_provider_not_supported', `Unsupported CALL_RECORDING_PROVIDER: "${providerName}"`);
}

// Test-only: internal-owner-test / unit tests need to reset the module-level
// cache between runs since env-derived adapters are cached by design.
export function __resetRecordingProviderCacheForTests(): void {
  cachedProvider = undefined;
  cachedProviderName = undefined;
}
