import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCloudflareRealtimeKitProvider,
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
  assert.equal(provider.normalizeStatus('STARTED'), 'starting');
  assert.equal(provider.normalizeStatus('RECORDING'), 'recording');
  assert.equal(provider.normalizeStatus('PAUSED'), 'recording');
  assert.equal(provider.normalizeStatus('STOPPED'), 'stopping');
  assert.equal(provider.normalizeStatus('UPLOADING'), 'uploading');
  assert.equal(provider.normalizeStatus('UPLOADED'), 'stored');
  assert.equal(provider.normalizeStatus('ERRORED'), 'failed');
});

test('an unrecognized provider status fails closed to "failed" rather than being guessed at', () => {
  const provider = createCloudflareRealtimeKitProvider();
  assert.equal(provider.normalizeStatus('SOME_FUTURE_STATUS_NOT_YET_DOCUMENTED'), 'failed');
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
