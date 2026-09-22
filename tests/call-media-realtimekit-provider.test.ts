import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { addRealtimeKitMeetingParticipant } from '../services/api/src/providers/recording-realtimekit.ts';
import { RecordingProviderError } from '../services/api/src/providers/recording.ts';

// W60 — mocks fetch against the documented Cloudflare RealtimeKit
// add-participant request/response shape (same verification style as W58's
// tests/recording-provider-realtimekit.test.ts): proves this adapter's own
// request construction and error handling, not that Cloudflare's live API
// matches the docs byte-for-byte (no live credentials exist in this
// environment -- see docs/W60_REALTIMEKIT_MOBILE_MEDIA_MIGRATION.md).

function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>) {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return fn().finally(() => {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const CONFIGURED_ENV = {
  CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc',
  CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
  CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'super-secret-token',
};

test('mints a participant token with the exact documented request shape', async () => {
  await withEnv(CONFIGURED_ENV, async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        success: true,
        data: { id: 'participant_1', token: 'short-lived-participant-token', custom_participant_id: 'call-1:caller' },
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await addRealtimeKitMeetingParticipant({
        providerMeetingId: 'meeting_1',
        customParticipantId: 'call-1:caller',
        presetName: 'voice_default',
      });
      assert.equal(result.participantId, 'participant_1');
      assert.equal(result.token, 'short-lived-participant-token');
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(capturedUrl, 'https://api.cloudflare.com/client/v4/accounts/acc/realtime/kit/app/meetings/meeting_1/participants');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal((capturedInit?.headers as Record<string, string>).authorization, 'Bearer super-secret-token');
    const body = JSON.parse(String(capturedInit?.body));
    assert.deepEqual(body, { custom_participant_id: 'call-1:caller', preset_name: 'voice_default' });
  });
});

test('never leaks the Cloudflare API token into a thrown error', async () => {
  await withEnv(CONFIGURED_ENV, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as typeof fetch;
    try {
      await assert.rejects(
        () => addRealtimeKitMeetingParticipant({ providerMeetingId: 'm', customParticipantId: 'c', presetName: 'p' }),
        (error: unknown) => {
          assert.ok(error instanceof RecordingProviderError);
          assert.doesNotMatch(String(error), /super-secret-token/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('a network failure fails closed without inventing a token', async () => {
  await withEnv(CONFIGURED_ENV, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    try {
      await assert.rejects(
        () => addRealtimeKitMeetingParticipant({ providerMeetingId: 'm', customParticipantId: 'c', presetName: 'p' }),
        /cloudflare_realtimekit_unreachable/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('missing config fails closed before any network call', async () => {
  await withEnv({
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: undefined,
    CLOUDFLARE_REALTIMEKIT_APP_ID: undefined,
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: undefined,
  }, async () => {
    await assert.rejects(
      () => addRealtimeKitMeetingParticipant({ providerMeetingId: 'm', customParticipantId: 'c', presetName: 'p' }),
      /cloudflare_realtimekit_not_configured/,
    );
  });
});

test('RealtimeKit listener media-connected is the answer boundary that starts recording', async () => {
  const source = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');
  assert.match(source, /realtimeKitListenerConnected = kind === 'media_connected'/);
  assert.match(source, /\(kind === 'answer' && role === 'listener'\) \|\| realtimeKitListenerConnected/);
  assert.match(source, /shouldStartRecording = row\.recording_mode === 'all_with_consent'/);
});
