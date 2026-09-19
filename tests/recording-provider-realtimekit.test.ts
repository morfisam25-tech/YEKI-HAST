import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCloudflareRealtimeKitProvider,
  getCloudflareRealtimeKitRecordingDetails,
  readCloudflareRealtimeKitConfig,
} from '../services/api/src/providers/recording-realtimekit.ts';
import { RecordingProviderError } from '../services/api/src/providers/recording.ts';

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { fn(); }
  finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvAsync(values: Record<string, string | undefined>, fn: () => Promise<void>) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { await fn(); }
  finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('missing Cloudflare RealtimeKit config resolves to null (provider simply not configured)', () => {
  withEnv({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: undefined,
    CLOUDFLARE_REALTIMEKIT_APP_ID: undefined,
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: undefined,
  }, () => {
    assert.equal(readCloudflareRealtimeKitConfig(), null);
  });
});

test('partially configured Cloudflare RealtimeKit env fails closed instead of silently proceeding', () => {
  withEnv({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_REALTIMEKIT_APP_ID: undefined,
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: undefined,
  }, () => {
    assert.throws(() => readCloudflareRealtimeKitConfig(), /cloudflare_realtimekit_config_incomplete/);
  });
});

test('normalizeStatus maps the documented Cloudflare status vocabulary onto platform recording states', () => {
  const provider = createCloudflareRealtimeKitProvider();
  assert.equal(provider.normalizeStatus('INVOKED'), 'starting');
  assert.equal(provider.normalizeStatus('RECORDING'), 'recording');
  assert.equal(provider.normalizeStatus('PAUSED'), 'recording');
  assert.equal(provider.normalizeStatus('UPLOADING'), 'uploading');
  assert.equal(provider.normalizeStatus('UPLOADED'), 'stored');
  assert.equal(provider.normalizeStatus('ERRORED'), 'failed');
});

test('an unrecognized provider status fails closed to "failed" rather than being guessed at', () => {
  const provider = createCloudflareRealtimeKitProvider();
  assert.equal(provider.normalizeStatus('SOME_FUTURE_STATUS_NOT_YET_DOCUMENTED'), 'failed');
});

// W81A: re-verified against developers.cloudflare.com/realtime/realtimekit/
// recording-guide/monitor-status/ and the Fetch-details-of-a-recording REST
// resource's status enum (INVOKED, RECORDING, UPLOADING, UPLOADED, ERRORED,
// PAUSED -- six members, confirmed via the resource's full schema). 'STARTED'
// and 'STOPPED' are not part of that enum; a provider that ever actually sent
// them was previously (incorrectly) treated as known/active here.
test('undocumented "STARTED"/"STOPPED" statuses are no longer treated as known -- they fail closed like any other unrecognized value', () => {
  const provider = createCloudflareRealtimeKitProvider();
  assert.equal(provider.normalizeStatus('STARTED'), 'failed');
  assert.equal(provider.normalizeStatus('STOPPED'), 'failed');
});

test('startRecording posts to the documented meeting-scoped recordings endpoint with a bearer token', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app1',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'secret-token-value',
  }, async () => {
    const originalFetch = globalThis.fetch;
    let observedUrl = '';
    let observedAuth = '';
    let observedBody: unknown;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      observedUrl = String(input);
      observedAuth = (init?.headers as Record<string, string>)?.authorization ?? '';
      observedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ success: true, data: { id: 'rec_1', status: 'INVOKED' } }), { status: 200 });
    }) as typeof fetch;
    try {
      const provider = createCloudflareRealtimeKitProvider();
      const result = await provider.startRecording({ providerMeetingId: 'meeting_1', maxSeconds: 3600 });
      assert.equal(result.providerRecordingId, 'rec_1');
      assert.equal(result.providerStatus, 'INVOKED');
      assert.equal(observedUrl, 'https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/recordings');
      assert.equal(observedAuth, 'Bearer secret-token-value');
      assert.deepEqual(observedBody, { meeting_id: 'meeting_1', max_seconds: 3600 });
      assert.doesNotMatch(JSON.stringify(result), /secret-token-value/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('a non-success provider response is never treated as a successful start', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app1',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'secret-token-value',
  }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as typeof fetch;
    try {
      const provider = createCloudflareRealtimeKitProvider();
      await assert.rejects(
        () => provider.startRecording({ providerMeetingId: 'meeting_1', maxSeconds: 3600 }),
        (error: unknown) => error instanceof RecordingProviderError && error.code === 'cloudflare_realtimekit_request_failed',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('an unreachable provider fails closed with a distinct error code', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app1',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'secret-token-value',
  }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    try {
      const provider = createCloudflareRealtimeKitProvider();
      await assert.rejects(
        () => provider.getRecordingStatus({ providerMeetingId: 'm1', providerRecordingId: 'r1' }),
        (error: unknown) => error instanceof RecordingProviderError && error.code === 'cloudflare_realtimekit_unreachable',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('startRecording never requests an audio export unless CALL_RECORDING_AUDIO_EXPORT_ENABLED=true (W81A opt-in)', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app1',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'secret-token-value',
    CALL_RECORDING_AUDIO_EXPORT_ENABLED: undefined,
  }, async () => {
    const originalFetch = globalThis.fetch;
    let observedBody: unknown;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      observedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ success: true, data: { id: 'rec_1', status: 'INVOKED' } }), { status: 200 });
    }) as typeof fetch;
    try {
      const provider = createCloudflareRealtimeKitProvider();
      await provider.startRecording({ providerMeetingId: 'meeting_1', maxSeconds: 3600 });
      assert.deepEqual(observedBody, { meeting_id: 'meeting_1', max_seconds: 3600 }, 'default behavior must stay unchanged (no live account to verify audio_config side effects)');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('startRecording requests a documented mono/MP3 audio export when explicitly opted in', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app1',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'secret-token-value',
    CALL_RECORDING_AUDIO_EXPORT_ENABLED: 'true',
  }, async () => {
    const originalFetch = globalThis.fetch;
    let observedBody: unknown;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      observedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ success: true, data: { id: 'rec_1', status: 'INVOKED' } }), { status: 200 });
    }) as typeof fetch;
    try {
      const provider = createCloudflareRealtimeKitProvider();
      await provider.startRecording({ providerMeetingId: 'meeting_1', maxSeconds: 3600 });
      assert.deepEqual(observedBody, {
        meeting_id: 'meeting_1',
        max_seconds: 3600,
        audio_config: { channel: 'mono', codec: 'MP3', export_file: true },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('getCloudflareRealtimeKitRecordingDetails normalizes the documented REST fields, including transient (not durable) download URLs', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app1',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'secret-token-value',
  }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      success: true,
      data: {
        id: 'rec_1',
        status: 'UPLOADED',
        session_id: 'session_1',
        output_file_name: 'weekly-sync.mp4',
        invoked_time: '2026-06-03T10:00:00.000Z',
        started_time: '2026-06-03T10:00:05.000Z',
        stopped_time: '2026-06-03T10:30:00.000Z',
        recording_duration: 1795,
        file_size: 2044680,
        download_url: 'https://example.com/recording.mp4',
        audio_download_url: 'https://example.com/recording.mp3',
        download_url_expiry: '2026-06-10T10:30:00.000Z',
      },
    }), { status: 200 })) as typeof fetch;
    try {
      const details = await getCloudflareRealtimeKitRecordingDetails('rec_1');
      assert.deepEqual(details, {
        providerRecordingId: 'rec_1',
        providerStatus: 'UPLOADED',
        sessionId: 'session_1',
        outputFileName: 'weekly-sync.mp4',
        invokedAt: '2026-06-03T10:00:00.000Z',
        startedAt: '2026-06-03T10:00:05.000Z',
        stoppedAt: '2026-06-03T10:30:00.000Z',
        recordingDurationSeconds: 1795,
        fileSizeBytes: 2044680,
        transientDownloadUrl: 'https://example.com/recording.mp4',
        transientAudioDownloadUrl: 'https://example.com/recording.mp3',
        transientDownloadUrlExpiry: '2026-06-10T10:30:00.000Z',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
