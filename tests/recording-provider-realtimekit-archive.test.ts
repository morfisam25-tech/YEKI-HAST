import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudflareRealtimeKitArchiveProvider } from '../services/api/src/providers/recording-realtimekit-archive.ts';

async function withEnvAsync(values: Record<string, string | undefined>, fn: () => Promise<void>) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { await fn(); } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('archive-enabled RealtimeKit start sends Cloudflare R2 storage_config and mono MP3 export without serializing credentials in result', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'cf-account',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'rtk-app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'provider-secret-token',
    CALL_RECORDING_ARCHIVE_R2_ENABLED: 'true',
    CALL_RECORDING_ARCHIVE_R2_ACCOUNT_ID: 'r2-account',
    CALL_RECORDING_ARCHIVE_R2_BUCKET: 'yeki-hast-recording-archive-preview-w88',
    CALL_RECORDING_ARCHIVE_R2_PATH: 'listener-recordings-preview',
    CALL_RECORDING_ARCHIVE_R2_ACCESS_KEY_ID: 'r2-access-key',
    CALL_RECORDING_ARCHIVE_R2_SECRET_ACCESS_KEY: 'r2-secret-key',
    CALL_RECORDING_AUDIO_EXPORT_ENABLED: 'true',
  }, async () => {
    const originalFetch = globalThis.fetch;
    let observedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      observedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true, data: { id: 'rec-real-shape', status: 'INVOKED' } }), { status: 200 });
    }) as typeof fetch;

    try {
      const provider = createCloudflareRealtimeKitArchiveProvider();
      const result = await provider.startRecording({ providerMeetingId: 'meeting-1', maxSeconds: 3600 });
      assert.equal(result.providerRecordingId, 'rec-real-shape');
      assert.equal(result.providerStatus, 'INVOKED');
      assert.deepEqual(observedBody, {
        meeting_id: 'meeting-1',
        max_seconds: 3600,
        audio_config: { channel: 'mono', codec: 'MP3', export_file: true },
        storage_config: {
          type: 'cloudflare',
          access_key: 'r2-access-key',
          secret: 'r2-secret-key',
          bucket: 'yeki-hast-recording-archive-preview-w88',
          path: 'listener-recordings-preview',
          account_id: 'r2-account',
        },
      });
      assert.doesNotMatch(JSON.stringify(result), /provider-secret-token|r2-access-key|r2-secret-key/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('archive disabled keeps the original W81A provider behavior and does not inject storage_config', async () => {
  await withEnvAsync({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'cf-account',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'rtk-app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'provider-secret-token',
    CALL_RECORDING_ARCHIVE_R2_ENABLED: undefined,
    CALL_RECORDING_ARCHIVE_R2_ACCOUNT_ID: undefined,
    CALL_RECORDING_ARCHIVE_R2_BUCKET: undefined,
    CALL_RECORDING_ARCHIVE_R2_PATH: undefined,
    CALL_RECORDING_ARCHIVE_R2_ACCESS_KEY_ID: undefined,
    CALL_RECORDING_ARCHIVE_R2_SECRET_ACCESS_KEY: undefined,
    CALL_RECORDING_AUDIO_EXPORT_ENABLED: undefined,
  }, async () => {
    const originalFetch = globalThis.fetch;
    let observedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      observedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true, data: { id: 'rec-1', status: 'INVOKED' } }), { status: 200 });
    }) as typeof fetch;

    try {
      const provider = createCloudflareRealtimeKitArchiveProvider();
      await provider.startRecording({ providerMeetingId: 'meeting-1', maxSeconds: 3600 });
      assert.deepEqual(observedBody, { meeting_id: 'meeting-1', max_seconds: 3600 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
