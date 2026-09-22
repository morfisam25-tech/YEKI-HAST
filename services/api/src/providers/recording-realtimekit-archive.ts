import {
  readR2ArchiveConfig,
  type R2ArchiveConfig,
} from '../lib/recording-archive-r2.ts';
import {
  createCloudflareRealtimeKitProvider,
  requireCloudflareRealtimeKitConfig,
} from './recording-realtimekit.ts';
import {
  RecordingProviderError,
  type RecordingProvider,
  type RecordingStartResult,
} from './recording.ts';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const REQUEST_TIMEOUT_MS = 8_000;

function audioExportEnabled(): boolean {
  return process.env.CALL_RECORDING_AUDIO_EXPORT_ENABLED?.trim().toLowerCase() === 'true';
}

function externalStorageConfig(config: R2ArchiveConfig) {
  return {
    type: 'cloudflare',
    access_key: config.accessKeyId,
    secret: config.secretAccessKey,
    bucket: config.bucket,
    path: config.path || '/',
    account_id: config.accountId,
  };
}

async function startWithArchive(
  providerMeetingId: string,
  maxSeconds: number,
  archiveConfig: R2ArchiveConfig,
): Promise<RecordingStartResult> {
  const providerConfig = requireCloudflareRealtimeKitConfig();
  const url = `${CLOUDFLARE_API_BASE}/${encodeURIComponent(providerConfig.accountId)}/realtime/kit/${encodeURIComponent(providerConfig.appId)}/recordings`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${providerConfig.apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        meeting_id: providerMeetingId,
        max_seconds: Math.min(Math.max(maxSeconds, 60), 86_400),
        ...(audioExportEnabled()
          ? { audio_config: { channel: 'mono', codec: 'MP3', export_file: true } }
          : {}),
        storage_config: externalStorageConfig(archiveConfig),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new RecordingProviderError('cloudflare_realtimekit_unreachable');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RecordingProviderError('cloudflare_realtimekit_invalid_response');
  }
  if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RecordingProviderError('cloudflare_realtimekit_request_failed');
  }
  const record = payload as Record<string, unknown>;
  if (record.success !== true || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) {
    throw new RecordingProviderError('cloudflare_realtimekit_request_failed');
  }
  const data = record.data as Record<string, unknown>;
  if (typeof data.id !== 'string' || typeof data.status !== 'string') {
    throw new RecordingProviderError('cloudflare_realtimekit_start_failed');
  }
  return { providerRecordingId: data.id, providerStatus: data.status };
}

// Adds direct RealtimeKit -> private R2 transfer only when the archive is
// explicitly configured. Every other lifecycle method stays on the verified
// W81A RealtimeKit adapter.
export function createCloudflareRealtimeKitArchiveProvider(): RecordingProvider {
  const base = createCloudflareRealtimeKitProvider();
  const archiveConfig = readR2ArchiveConfig();
  if (!archiveConfig) return base;

  return {
    ...base,
    async startRecording(input) {
      return startWithArchive(input.providerMeetingId, input.maxSeconds, archiveConfig);
    },
  };
}
