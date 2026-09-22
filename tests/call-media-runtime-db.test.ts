import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

// W60 — real runtime regression for the RealtimeKit mobile media migration's
// server-side layer (media session creation/reuse, participant auth, cross-
// call isolation, consent prerequisite) against an isolated PostgreSQL
// schema. Same harness pattern as tests/recording-runtime-db.test.ts (W58);
// run via scripts/run-call-media-runtime-db-test.sh, which provisions the
// same kind of disposable cluster with migration 0011 additionally applied.

const dbUrl = process.env.CALL_MEDIA_RUNTIME_DB_URL;
const skip = dbUrl
  ? false
  : 'set CALL_MEDIA_RUNTIME_DB_URL to a disposable non-production database (see scripts/run-call-media-runtime-db-test.sh)';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeReq(token: string | null, body: unknown) {
  const req = Readable.from([Buffer.from(JSON.stringify(body ?? {}))]) as Readable & { headers: Record<string, string> };
  req.headers = token ? { authorization: `Bearer ${token}` } : {};
  return req as unknown as import('node:http').IncomingMessage;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: '',
    writeHead(status: number) { this.statusCode = status; return this; },
    end(chunk?: string) { this.body = chunk ?? ''; return this; },
  };
  return res;
}

function mockFetchSequence(responses: Array<{ status: number; json: unknown }>) {
  const calls: Array<{ url: string }> = [];
  const originalFetch = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (input: unknown) => {
    calls.push({ url: String(input) });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(JSON.stringify(next.json), { status: next.status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test('W60 RealtimeKit mobile media migration runtime', { skip }, async (t) => {
  process.env.DATABASE_URL = dbUrl;

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const { recordCallRecordingConsent, startRecordingForCall } = await import('../services/api/src/services/recording-lifecycle.ts');
  const { ensureCallMediaSession } = await import('../services/api/src/services/call-media-session.ts');
  const { __resetRecordingProviderCacheForTests } = await import('../services/api/src/providers/recording.ts');
  const { postInternetVoiceMediaAuth } = await import('../services/api/src/routes/internet-voice-media.ts');

  t.after(async () => { await closePool(); });
  t.beforeEach(() => { __resetRecordingProviderCacheForTests(); });

  function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void> | void) {
    const before = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(values)) {
      before.set(key, process.env[key]);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const restore = () => {
      for (const [key, value] of before) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
    const result = fn();
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return undefined;
  }

  const RECORDING_ENV = {
    APP_ENV: 'local',
    VERCEL_ENV: undefined,
    CALL_RECORDING_REQUIRED: 'true',
    CALL_RECORDING_PROVIDER: 'cloudflare_realtimekit',
    CALL_RECORDING_CONSENT_POLICY_VERSION: 'rec-2026-09-14-v1',
  } as const;
  const MEDIA_ENV = {
    CALL_MEDIA_PROVIDER: 'realtimekit',
    CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME: 'voice_default',
    CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc',
    CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
    CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'tok',
  } as const;

  const product = (await query<{ id: string }>("SELECT id::text FROM app.products WHERE code='yeki_hast'")).rows[0];
  const serviceRow = (await query<{ id: string }>("SELECT id::text FROM app.service_catalog WHERE code='human_listening'")).rows[0];
  const market = (await query<{ id: string }>("SELECT id::text FROM app.markets WHERE code='ir'")).rows[0];
  const language = (await query<{ id: string }>("SELECT id::text FROM app.languages WHERE code='fa'")).rows[0];
  const pricingPlan = (await query<{ id: string }>("SELECT id::text FROM app.pricing_plans WHERE is_active=true LIMIT 1")).rows[0];

  let callSeq = 0;
  async function seedCall(recordingMode: 'none' | 'all_with_consent', status = 'calling_listener'): Promise<{ callId: string; callerId: string; listenerId: string; callerToken: string; listenerToken: string }> {
    callSeq += 1;
    const callerId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const listenerId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    await query("INSERT INTO app.listener_profiles(user_id, nickname, gender) VALUES ($1,'Test Listener','female')", [listenerId]);
    const call = await query<{ id: string }>(`
      INSERT INTO app.call_sessions(
        product_id, service_id, market_id, caller_market_id, caller_user_id, listener_user_id,
        client_request_id, status, requested_listener_gender, requested_language_id,
        pricing_plan_id, currency_code, caller_rate_per_minute_minor, listener_rate_per_minute_minor,
        listener_currency_code, authorized_minor, max_billable_seconds, recording_mode,
        transport
      ) VALUES ($1,$2,$3,$3,$4,$5,$6,$10::app.call_status,'any',$7,$8,'IRR',31000,21000,'IRR',0,600,$9::app.recording_mode,'internet_voice')
      RETURNING id::text
    `, [product.id, serviceRow.id, market.id, callerId, listenerId, `w60-test-${callSeq}-${randomBytes(6).toString('hex')}`, language.id, pricingPlan.id, recordingMode, status]);
    async function issueToken(userId: string): Promise<string> {
      const token = `w60-${randomBytes(24).toString('hex')}`;
      await query("INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [userId, sha256Hex(token)]);
      return token;
    }
    return { callId: call.rows[0].id, callerId, listenerId, callerToken: await issueToken(callerId), listenerToken: await issueToken(listenerId) };
  }

  await t.test('ensureCallMediaSession is idempotent and returns the same meeting on repeated calls', async () => {
    await withEnv({ ...RECORDING_ENV, ...MEDIA_ENV, CALL_RECORDING_REQUIRED: 'false', CALL_RECORDING_PROVIDER: undefined, CALL_RECORDING_CONSENT_POLICY_VERSION: undefined }, async () => {
      const { callId } = await seedCall('none');
      const mock = mockFetchSequence([{ status: 200, json: { success: true, data: { id: 'meeting_abc' } } }]);
      let first, second;
      try {
        first = await ensureCallMediaSession({ query }, callId, 'cloudflare_realtimekit');
        second = await ensureCallMediaSession({ query }, callId, 'cloudflare_realtimekit');
      } finally {
        assert.equal(mock.calls.length, 1, 'the provider must only be asked to create a meeting once');
        mock.restore();
      }
      assert.equal(first.providerMeetingId, 'meeting_abc');
      assert.equal(second.providerMeetingId, 'meeting_abc');
    });
  });

  await t.test('recording start reuses the exact meeting media-auth already created -- never a second Cloudflare meeting', async () => {
    await withEnv({ ...RECORDING_ENV, ...MEDIA_ENV }, async () => {
      const { callId, callerId, listenerId, callerToken } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });

      const mediaMock = mockFetchSequence([
        { status: 200, json: { success: true, data: { id: 'shared_meeting_1' } } },
        { status: 200, json: { success: true, data: { id: 'p1', token: 'tok1', custom_participant_id: `${callId}:caller` } } },
      ]);
      try {
        const res = makeRes();
        await postInternetVoiceMediaAuth(makeReq(callerToken, {}), res as never, callId);
        assert.equal(res.statusCode, 200);
      } finally {
        mediaMock.restore();
      }

      const startMock = mockFetchSequence([{ status: 200, json: { success: true, data: { id: 'rec_1', status: 'RECORDING' } } }]);
      let recordingState: string;
      try {
        recordingState = await startRecordingForCall(callId, 600);
      } finally {
        assert.equal(startMock.calls.length, 1, 'startRecordingForCall must not create a second meeting -- it must reuse the media session row');
        startMock.restore();
      }
      assert.equal(recordingState, 'recording');

      const session = await query<{ provider_meeting_id: string }>('SELECT provider_meeting_id FROM private_data.call_recording_sessions WHERE call_session_id=$1', [callId]);
      const mediaSession = await query<{ provider_meeting_id: string }>('SELECT provider_meeting_id FROM app.call_media_sessions WHERE call_session_id=$1', [callId]);
      assert.equal(session.rows[0].provider_meeting_id, 'shared_meeting_1');
      assert.equal(mediaSession.rows[0].provider_meeting_id, 'shared_meeting_1');
    });
  });

  await t.test('a user who is not this call\'s caller or listener gets call_not_found, not a leak that the call exists', async () => {
    await withEnv({ ...RECORDING_ENV, ...MEDIA_ENV, CALL_RECORDING_REQUIRED: 'false', CALL_RECORDING_PROVIDER: undefined, CALL_RECORDING_CONSENT_POLICY_VERSION: undefined }, async () => {
      const { callId } = await seedCall('none');
      const strangerId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
      const strangerToken = `w60-stranger-${randomBytes(16).toString('hex')}`;
      await query("INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [strangerId, sha256Hex(strangerToken)]);

      const res = makeRes();
      await assert.rejects(
        () => postInternetVoiceMediaAuth(makeReq(strangerToken, {}), res as never, callId),
        /call_not_found/,
      );
    });
  });

  await t.test('recording-required call rejects media-auth without this participant\'s own recording consent', async () => {
    await withEnv({ ...RECORDING_ENV, ...MEDIA_ENV }, async () => {
      const { callId, callerToken } = await seedCall('all_with_consent');
      const res = makeRes();
      await assert.rejects(
        () => postInternetVoiceMediaAuth(makeReq(callerToken, {}), res as never, callId),
        /recording_consent_required/,
      );
    });
  });

  await t.test('media-auth mints a fresh token per call and each participant gets a deterministic customParticipantId', async () => {
    await withEnv({ ...RECORDING_ENV, ...MEDIA_ENV, CALL_RECORDING_REQUIRED: 'false', CALL_RECORDING_PROVIDER: undefined, CALL_RECORDING_CONSENT_POLICY_VERSION: undefined }, async () => {
      const { callId, callerToken, listenerToken } = await seedCall('none');
      const seenCustomIds: string[] = [];
      const originalFetch = globalThis.fetch;
      const responses = [
        { success: true, data: { id: 'meeting_x' } },
        { success: true, data: { id: 'p_caller', token: 'tok_caller' } },
        { success: true, data: { id: 'p_listener', token: 'tok_listener' } },
      ];
      let i = 0;
      globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
        if (init?.body) {
          const parsed = JSON.parse(String(init.body));
          if (parsed.custom_participant_id) seenCustomIds.push(parsed.custom_participant_id);
        }
        const next = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return new Response(JSON.stringify(next), { status: 200 });
      }) as typeof fetch;

      try {
        const callerRes = makeRes();
        await postInternetVoiceMediaAuth(makeReq(callerToken, {}), callerRes as never, callId);
        const listenerRes = makeRes();
        await postInternetVoiceMediaAuth(makeReq(listenerToken, {}), listenerRes as never, callId);

        const callerAuth = JSON.parse(callerRes.body);
        const listenerAuth = JSON.parse(listenerRes.body);
        assert.equal(callerAuth.authToken, 'tok_caller');
        assert.equal(listenerAuth.authToken, 'tok_listener');
        assert.equal(callerAuth.meetingId, listenerAuth.meetingId, 'both participants must join the same meeting');
        assert.deepEqual(seenCustomIds, [`${callId}:caller`, `${callId}:listener`]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
