import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileRealtimeKitArchiveReference } from '../services/api/src/services/recording-archive.ts';

test('archive reconciliation failure diagnostics omit secret-like exception content', async () => {
  const env = {
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'cf-account',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'rtk-app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'provider-secret-token',
    CALL_RECORDING_ARCHIVE_R2_ENABLED: 'true',
    CALL_RECORDING_ARCHIVE_R2_ACCOUNT_ID: 'r2-account',
    CALL_RECORDING_ARCHIVE_R2_BUCKET: 'w88-private-bucket',
    CALL_RECORDING_ARCHIVE_R2_PATH: 'listener-recordings-preview',
    CALL_RECORDING_ARCHIVE_R2_ACCESS_KEY_ID: 'r2-access-key',
    CALL_RECORDING_ARCHIVE_R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  };
  const before = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(env)) {
    before.set(name, process.env[name]);
    process.env[name] = value;
  }

  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalError = console.error;
  const infoLogs: string[] = [];
  const errorLogs: string[] = [];
  let fetchCount = 0;
  console.info = (...values: unknown[]) => infoLogs.push(values.map(String).join(' '));
  console.error = (...values: unknown[]) => errorLogs.push(values.map(String).join(' '));
  globalThis.fetch = (async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: 'ffff34e0-d7ae-4e0a-a992-fda4fe9bbf92',
          status: 'UPLOADED',
          output_file_name: 'recording.mp4',
        },
      }), { status: 200 });
    }
    throw new TypeError('fetch failed https://example.invalid/object?X-Amz-Signature=secret r2-secret-key');
  }) as typeof fetch;

  try {
    await assert.rejects(() => reconcileRealtimeKitArchiveReference({
      recordingSessionId: '581e1f51-8852-4e70-a4bd-6e9c59cb0061',
      providerRecordingId: 'ffff34e0-d7ae-4e0a-a992-fda4fe9bbf92',
    }));
    assert.match(infoLogs.join('\n'), /archive_reconcile_r2_head_start/);
    const diagnostic = errorLogs.join('\n');
    assert.match(diagnostic, /archive_reconcile_failed/);
    assert.match(diagnostic, /archive_reconcile_r2_head/);
    assert.match(diagnostic, /TypeError/);
    assert.doesNotMatch(diagnostic, /example\.invalid|X-Amz|Signature|r2-secret-key|provider-secret-token/);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.error = originalError;
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
