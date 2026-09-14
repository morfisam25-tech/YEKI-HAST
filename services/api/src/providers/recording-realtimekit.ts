import type { RecordingState } from '../../../../packages/domain/src/recording.ts';
import {
  RecordingProviderError,
  type RecordingProvider,
  type RecordingSessionHandle,
  type RecordingStartResult,
  type RecordingStatusResult,
  type RecordingStopResult,
} from './recording.ts';

// Cloudflare RealtimeKit REST API, current as of this branch (verified against
// developers.cloudflare.com/realtime/realtimekit/ -- recording-guide/,
// rest-api/resources/meetings, rest-api/resources/recordings). Do not change
// these paths/fields without re-checking the live docs: this repo has no
// automated contract test against the real API (no live credentials exist
// yet -- see docs/W58_RECORDING_CORE_FOUNDATION.md, "remaining W54/W60
// dependency").
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const REQUEST_TIMEOUT_MS = 8_000;

// Cloudflare's own vocabulary for recording.status, as documented on the
// recordings REST resource page. Anything not in this list is treated as
// unrecognized (see normalizeStatus below) rather than guessed at.
const KNOWN_PROVIDER_STATUSES = new Set([
  'INVOKED',
  'STARTED',
  'RECORDING',
  'PAUSED',
  'STOPPED',
  'UPLOADING',
  'UPLOADED',
  'ERRORED',
]);

export interface CloudflareRealtimeKitConfig {
  accountId: string;
  appId: string;
  apiToken: string;
}

export function readCloudflareRealtimeKitConfig(): CloudflareRealtimeKitConfig | null {
  const accountId = process.env.CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID?.trim() ?? '';
  const appId = process.env.CLOUDFLARE_REALTIMEKIT_APP_ID?.trim() ?? '';
  const apiToken = process.env.CLOUDFLARE_REALTIMEKIT_API_TOKEN?.trim() ?? '';
  if (!accountId && !appId && !apiToken) return null;
  if (!accountId || !appId || !apiToken) {
    throw new RecordingProviderError('cloudflare_realtimekit_config_incomplete');
  }
  return { accountId, appId, apiToken };
}

function requireCloudflareRealtimeKitConfig(): CloudflareRealtimeKitConfig {
  const config = readCloudflareRealtimeKitConfig();
  if (!config) throw new RecordingProviderError('cloudflare_realtimekit_not_configured');
  return config;
}

async function callCloudflareApi<T>(
  config: CloudflareRealtimeKitConfig,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${CLOUDFLARE_API_BASE}/${encodeURIComponent(config.accountId)}/realtime/kit/${encodeURIComponent(config.appId)}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  if (record.success !== true || !('data' in record)) {
    throw new RecordingProviderError('cloudflare_realtimekit_request_failed');
  }
  return record.data as T;
}

function normalizeStatus(providerStatus: string): RecordingState {
  if (!KNOWN_PROVIDER_STATUSES.has(providerStatus)) return 'failed';
  switch (providerStatus) {
    case 'INVOKED':
    case 'STARTED':
      return 'starting';
    case 'RECORDING':
    case 'PAUSED':
      return 'recording';
    case 'STOPPED':
      return 'stopping';
    case 'UPLOADING':
      return 'uploading';
    case 'UPLOADED':
      return 'stored';
    case 'ERRORED':
      return 'failed';
    default:
      return 'failed';
  }
}

export function createCloudflareRealtimeKitProvider(): RecordingProvider {
  return {
    name: 'cloudflare_realtimekit',

    async prepareSession(input: { callSessionId: string }): Promise<RecordingSessionHandle> {
      const config = requireCloudflareRealtimeKitConfig();
      const data = await callCloudflareApi<{ id: string }>(config, 'POST', '/meetings', {
        title: `yeki-hast-call-${input.callSessionId}`,
        record_on_start: false,
      });
      if (!data?.id) throw new RecordingProviderError('cloudflare_realtimekit_meeting_create_failed');
      return { providerMeetingId: data.id };
    },

    async startRecording(input: { providerMeetingId: string; maxSeconds: number }): Promise<RecordingStartResult> {
      const config = requireCloudflareRealtimeKitConfig();
      const data = await callCloudflareApi<{ id: string; status: string }>(config, 'POST', '/recordings', {
        meeting_id: input.providerMeetingId,
        max_seconds: Math.min(Math.max(input.maxSeconds, 60), 86_400),
      });
      if (!data?.id || !data.status) throw new RecordingProviderError('cloudflare_realtimekit_start_failed');
      return { providerRecordingId: data.id, providerStatus: data.status };
    },

    async getRecordingStatus(input: {
      providerMeetingId: string;
      providerRecordingId: string;
    }): Promise<RecordingStatusResult> {
      const config = requireCloudflareRealtimeKitConfig();
      const data = await callCloudflareApi<{
        status: string;
        started_time?: string | null;
        stopped_time?: string | null;
      }>(config, 'GET', `/recordings/${encodeURIComponent(input.providerRecordingId)}`);
      if (!data?.status) throw new RecordingProviderError('cloudflare_realtimekit_status_unavailable');
      return {
        providerStatus: data.status,
        startedAt: data.started_time ?? null,
        endedAt: data.stopped_time ?? null,
        failureCode: data.status === 'ERRORED' ? 'cloudflare_realtimekit_recording_errored' : null,
      };
    },

    async stopRecording(input: {
      providerMeetingId: string;
      providerRecordingId: string;
    }): Promise<RecordingStopResult> {
      const config = requireCloudflareRealtimeKitConfig();
      const data = await callCloudflareApi<{ status: string }>(
        config,
        'PUT',
        `/recordings/${encodeURIComponent(input.providerRecordingId)}`,
        { action: 'stop' },
      );
      if (!data?.status) throw new RecordingProviderError('cloudflare_realtimekit_stop_failed');
      return { providerStatus: data.status };
    },

    normalizeStatus,
  };
}
