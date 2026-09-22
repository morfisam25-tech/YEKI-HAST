import assert from 'node:assert/strict';
import test from 'node:test';
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

// W81A — real runtime regression for the RealtimeKit `recording.statusUpdate`
// webhook (services/api/src/routes/recording-webhook.ts) against an isolated
// PostgreSQL schema. Same pattern as tests/recording-runtime-db.test.ts: runs
// only when RECORDING_RUNTIME_DB_URL points at a disposable, non-production
// database (see scripts/run-recording-runtime-db-test.sh).
//
// The signature verification itself is exercised for real here: a fresh RSA
// keypair is generated per test run, the (mocked) RealtimeKit public-key
// endpoint serves its public half, and every payload is signed with the
// private half exactly the way RealtimeKit signs real deliveries (RSA-SHA256
// over the raw body) -- this is not a stubbed-out "assume it works" check.

const dbUrl = process.env.RECORDING_RUNTIME_DB_URL;
const skip = dbUrl
  ? false
  : 'set RECORDING_RUNTIME_DB_URL to a disposable non-production database (see scripts/run-recording-runtime-db-test.sh)';

function makeRawReq(body: Buffer, headers: Record<string, string>) {
  const req = Readable.from([body]) as Readable & { headers: Record<string, string> };
  req.headers = headers;
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

test('W81A RealtimeKit recording webhook runtime', { skip }, async (t) => {
  process.env.DATABASE_URL = dbUrl;

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  function sign(body: Buffer): string {
    const signer = createSign('RSA-SHA256');
    signer.update(body);
    signer.end();
    return signer.sign(privateKey).toString('base64');
  }

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const { handleRealtimeKitRecordingWebhook } = await import('../services/api/src/routes/recording-webhook.ts');
  const { __resetRealtimeKitWebhookPublicKeyCacheForTests } = await import('../services/api/src/lib/recording-webhook-signature.ts');

  t.after(async () => { await closePool(); });

  const originalFetch = globalThis.fetch;
  t.beforeEach(() => {
    __resetRealtimeKitWebhookPublicKeyCacheForTests();
    globalThis.fetch = (async (input: unknown) => {
      if (String(input).includes('.well-known/webhooks.json')) {
        return new Response(JSON.stringify({ success: true, data: { publicKey: publicKeyPem }, message: '' }), { status: 200 });
      }
      throw new Error(`unexpected fetch in webhook test: ${String(input)}`);
    }) as typeof fetch;
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  async function seedRecordingSession(
    state: string,
    opts: { legalHold?: boolean } = {},
  ): Promise<{ callSessionId: string; recordingSessionId: string; providerRecordingId: string }> {
    const callerId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const listenerId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    await query("INSERT INTO app.listener_profiles(user_id, nickname, gender) VALUES ($1,'Test Listener','female')", [listenerId]);
    const product = (await query<{ id: string }>("SELECT id::text FROM app.products WHERE code='yeki_hast'")).rows[0];
    const serviceRow = (await query<{ id: string }>("SELECT id::text FROM app.service_catalog WHERE code='human_listening'")).rows[0];
    const market = (await query<{ id: string }>("SELECT id::text FROM app.markets WHERE code='ir'")).rows[0];
    const language = (await query<{ id: string }>("SELECT id::text FROM app.languages WHERE code='fa'")).rows[0];
    const pricingPlan = (await query<{ id: string }>('SELECT id::text FROM app.pricing_plans WHERE is_active=true LIMIT 1')).rows[0];
    const call = await query<{ id: string }>(`
      INSERT INTO app.call_sessions(
        product_id, service_id, market_id, caller_market_id, caller_user_id, listener_user_id,
        client_request_id, status, requested_listener_gender, requested_language_id,
        pricing_plan_id, currency_code, caller_rate_per_minute_minor, listener_rate_per_minute_minor,
        listener_currency_code, authorized_minor, max_billable_seconds, recording_mode
      ) VALUES ($1,$2,$3,$3,$4,$5,$6,'calling_listener','any',$7,$8,'IRR',31000,21000,'IRR',0,600,'all_with_consent')
      RETURNING id::text
    `, [product.id, serviceRow.id, market.id, callerId, listenerId, `w81a-webhook-${randomUUID()}`, language.id, pricingPlan.id]);
    const callSessionId = call.rows[0].id;
    const providerRecordingId = randomUUID();
    const session = await query<{ id: string }>(`
      INSERT INTO private_data.call_recording_sessions(
        call_session_id, provider, provider_meeting_id, provider_recording_id, state, consent_policy_version,
        legal_hold, legal_hold_reason_code, legal_hold_case_kind, legal_hold_case_id
      ) VALUES ($1,'cloudflare_realtimekit',$2,$3,$4::app.recording_state,'v1',$5,$6,$7,$8)
      RETURNING id::text
    `, [
      callSessionId, randomUUID(), providerRecordingId, state,
      opts.legalHold ?? false,
      opts.legalHold ? 'open_investigation' : null,
      opts.legalHold ? 'report' : null,
      opts.legalHold ? randomUUID() : null,
    ]);
    return { callSessionId, recordingSessionId: session.rows[0].id, providerRecordingId };
  }

  function uploadedPayload(providerRecordingId: string, metadata: { recordingDuration?: unknown; fileSize?: unknown } = {}): Buffer {
    return Buffer.from(JSON.stringify({
      event: 'recording.statusUpdate',
      recording: {
        id: providerRecordingId,
        recordingId: providerRecordingId,
        status: 'UPLOADED',
        downloadUrl: 'https://example.com/recording.mp4',
        audioDownloadUrl: 'https://example.com/recording.mp3',
        downloadUrlExpiry: '2026-06-10T10:30:00.000Z',
        startedTime: '2026-06-03T10:00:00.000Z',
        stoppedTime: '2026-06-03T10:30:00.000Z',
        fileSize: Object.hasOwn(metadata, 'fileSize') ? metadata.fileSize : '2044680',
        outputFileName: 'weekly-sync.mp4',
        recordingDuration: Object.hasOwn(metadata, 'recordingDuration') ? metadata.recordingDuration : 1800,
      },
    }));
  }

  function statusPayload(providerRecordingId: string, status: string, metadata: Record<string, unknown> = {}): Buffer {
    return Buffer.from(JSON.stringify({
      event: 'recording.statusUpdate',
      recording: { id: providerRecordingId, recordingId: providerRecordingId, status, ...metadata },
    }));
  }

  async function deliver(body: Buffer): Promise<void> {
    const res = makeRes();
    await handleRealtimeKitRecordingWebhook(
      makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), res as never,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).matched, true);
  }

  await t.test('a request with no rtk-signature header is rejected before touching the database', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'recording.statusUpdate', recording: { id: 'x', status: 'UPLOADED' } }));
    await assert.rejects(
      () => handleRealtimeKitRecordingWebhook(makeRawReq(body, { 'rtk-uuid': randomUUID() }), makeRes() as never),
      /invalid_signature/,
    );
  });

  await t.test('a tampered body is rejected even though the signature header is present', async () => {
    const original = uploadedPayload('some-id');
    const signature = sign(original);
    const tampered = Buffer.from(original.toString('utf8').replace('UPLOADED', 'ERRORED'));
    await assert.rejects(
      () => handleRealtimeKitRecordingWebhook(makeRawReq(tampered, { 'rtk-signature': signature, 'rtk-uuid': randomUUID() }), makeRes() as never),
      /invalid_signature/,
    );
  });

  await t.test('a correctly signed UPLOADED event transitions the matched session to stored and records segment metadata, idempotently', async () => {
    const { recordingSessionId, providerRecordingId } = await seedRecordingSession('uploading');
    const body = uploadedPayload(providerRecordingId);
    const signature = sign(body);
    const rtkUuid = randomUUID();

    const res1 = makeRes();
    await handleRealtimeKitRecordingWebhook(makeRawReq(body, { 'rtk-signature': signature, 'rtk-uuid': rtkUuid }), res1 as never);
    assert.equal(res1.statusCode, 200);
    const payload1 = JSON.parse(res1.body);
    assert.equal(payload1.matched, true);

    const sessionRow = await query<{ state: string; retention_until: string | null }>(
      'SELECT state::text, retention_until::text FROM private_data.call_recording_sessions WHERE id=$1', [recordingSessionId],
    );
    assert.equal(sessionRow.rows[0].state, 'stored');
    assert.ok(sessionRow.rows[0].retention_until, 'retention_until must be set once stored');

    const segment = await query(
      'SELECT duration_seconds, bytes FROM private_data.call_recording_segments WHERE recording_session_id=$1 AND provider_output_id=$2',
      [recordingSessionId, providerRecordingId],
    );
    assert.equal(segment.rowCount, 1);
    assert.equal(segment.rows[0].duration_seconds, 1800);
    assert.equal(Number(segment.rows[0].bytes), 2044680);

    // Redelivery of the exact same rtk-uuid must be a no-op, not a duplicate segment.
    const res2 = makeRes();
    await handleRealtimeKitRecordingWebhook(makeRawReq(body, { 'rtk-signature': signature, 'rtk-uuid': rtkUuid }), res2 as never);
    assert.equal(res2.statusCode, 200);
    assert.equal(JSON.parse(res2.body).duplicate, true);

    const segmentAfterRedelivery = await query(
      'SELECT count(*)::int AS n FROM private_data.call_recording_segments WHERE recording_session_id=$1 AND provider_output_id=$2',
      [recordingSessionId, providerRecordingId],
    );
    assert.equal(segmentAfterRedelivery.rows[0].n, 1, 'redelivery must not create a duplicate segment row');
  });

  await t.test('a signed fractional-duration UPLOADED event stores a safe integer and both automatic retention dates', async () => {
    const { recordingSessionId, providerRecordingId } = await seedRecordingSession('uploading');
    const body = uploadedPayload(providerRecordingId, { recordingDuration: 14.048, fileSize: '558670' });
    const response = makeRes();
    await handleRealtimeKitRecordingWebhook(
      makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), response as never,
    );
    assert.equal(response.statusCode, 200);
    const session = await query<{
      state: string; retention_until: Date | null; purge_eligible_at: Date | null; updated_at: Date;
    }>(`
      SELECT state::text, retention_until, purge_eligible_at, updated_at
      FROM private_data.call_recording_sessions WHERE id=$1
    `, [recordingSessionId]);
    const row = session.rows[0];
    assert.equal(row.state, 'stored');
    assert.ok(row.retention_until);
    assert.ok(row.purge_eligible_at);
    assert.equal(row.retention_until.getTime(), row.purge_eligible_at.getTime());
    const retentionDays = (row.retention_until.getTime() - row.updated_at.getTime()) / 86_400_000;
    assert.ok(retentionDays >= 29.99 && retentionDays <= 30.01);
    const segment = await query<{ duration_seconds: number; bytes: string }>(`
      SELECT duration_seconds, bytes::text FROM private_data.call_recording_segments
      WHERE recording_session_id=$1 AND provider_output_id=$2
    `, [recordingSessionId, providerRecordingId]);
    assert.equal(segment.rows[0].duration_seconds, 15);
    assert.equal(segment.rows[0].bytes, '558670');
  });

  await t.test('RECORDING, UPLOADING, UPLOADED finalize the same provisional segment', async () => {
    const { recordingSessionId, providerRecordingId } = await seedRecordingSession('stopping');
    await deliver(statusPayload(providerRecordingId, 'RECORDING'));
    const provisional = await query<{ id: string; state: string }>(`
      SELECT id::text, state::text FROM private_data.call_recording_segments
      WHERE recording_session_id=$1 AND provider_output_id=$2
    `, [recordingSessionId, providerRecordingId]);
    assert.equal(provisional.rowCount, 1);
    assert.equal(provisional.rows[0].state, 'recording');

    await deliver(statusPayload(providerRecordingId, 'UPLOADING'));
    await deliver(statusPayload(providerRecordingId, 'UPLOADED', {
      startedTime: '2026-06-03T10:00:00.000Z',
      stoppedTime: '2026-06-03T10:00:15.000Z',
      recordingDuration: 14.048,
      fileSize: '558670',
    }));
    const session = await query<{ state: string; retention_until: Date | null; purge_eligible_at: Date | null }>(`
      SELECT state::text, retention_until, purge_eligible_at
      FROM private_data.call_recording_sessions WHERE id=$1
    `, [recordingSessionId]);
    assert.equal(session.rows[0].state, 'stored');
    assert.ok(session.rows[0].retention_until);
    assert.ok(session.rows[0].purge_eligible_at);
    assert.equal(session.rows[0].retention_until.getTime(), session.rows[0].purge_eligible_at.getTime());
    const segments = await query<{ id: string; state: string; duration_seconds: number; bytes: string; ended_at: Date | null }>(`
      SELECT id::text, state::text, duration_seconds, bytes::text, ended_at
      FROM private_data.call_recording_segments WHERE recording_session_id=$1 AND provider_output_id=$2
    `, [recordingSessionId, providerRecordingId]);
    assert.equal(segments.rowCount, 1);
    assert.equal(segments.rows[0].id, provisional.rows[0].id);
    assert.equal(segments.rows[0].state, 'stored');
    assert.equal(segments.rows[0].duration_seconds, 15);
    assert.equal(segments.rows[0].bytes, '558670');
    assert.ok(segments.rows[0].ended_at);
  });

  await t.test('delayed earlier provider events cannot regress a stored segment or clear final metadata', async () => {
    const { recordingSessionId, providerRecordingId } = await seedRecordingSession('uploading');
    await deliver(uploadedPayload(providerRecordingId, { recordingDuration: 14.048, fileSize: '558670' }));
    for (const status of ['RECORDING', 'UPLOADING']) {
      await deliver(statusPayload(providerRecordingId, status, {
        recordingDuration: null, fileSize: null,
      }));
    }
    const segments = await query<{ state: string; duration_seconds: number; bytes: string; ended_at: Date | null }>(`
      SELECT state::text, duration_seconds, bytes::text, ended_at
      FROM private_data.call_recording_segments WHERE recording_session_id=$1 AND provider_output_id=$2
    `, [recordingSessionId, providerRecordingId]);
    assert.equal(segments.rowCount, 1);
    assert.equal(segments.rows[0].state, 'stored');
    assert.equal(segments.rows[0].duration_seconds, 15);
    assert.equal(segments.rows[0].bytes, '558670');
    assert.ok(segments.rows[0].ended_at);
  });

  await t.test('a signed UPLOADED event preserves null duration while storing valid numeric file size', async () => {
    const { recordingSessionId, providerRecordingId } = await seedRecordingSession('uploading');
    const body = uploadedPayload(providerRecordingId, { recordingDuration: null, fileSize: 558670 });
    const response = makeRes();
    await handleRealtimeKitRecordingWebhook(
      makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), response as never,
    );
    assert.equal(response.statusCode, 200);
    const segment = await query<{ duration_seconds: number | null; bytes: string }>(`
      SELECT duration_seconds, bytes::text FROM private_data.call_recording_segments
      WHERE recording_session_id=$1 AND provider_output_id=$2
    `, [recordingSessionId, providerRecordingId]);
    assert.equal(segment.rows[0].duration_seconds, null);
    assert.equal(segment.rows[0].bytes, '558670');
  });

  await t.test('signed invalid webhook metadata fails closed without changing lifecycle state', async () => {
    for (const metadata of [
      { recordingDuration: -1 },
      { recordingDuration: '14.048' },
      { fileSize: '-1' },
      { fileSize: '1.5' },
      { fileSize: '1e3' },
    ]) {
      const { recordingSessionId, providerRecordingId } = await seedRecordingSession('uploading');
      const body = uploadedPayload(providerRecordingId, metadata);
      await assert.rejects(
        () => handleRealtimeKitRecordingWebhook(
          makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), makeRes() as never,
        ),
        /cloudflare_realtimekit_invalid_(recording_duration|file_size)/,
      );
      const session = await query<{ state: string }>(
        'SELECT state::text FROM private_data.call_recording_sessions WHERE id=$1', [recordingSessionId],
      );
      assert.equal(session.rows[0].state, 'uploading');
    }
  });

  await t.test('an event for a recording id with no matching session is safely ignored, not a fabricated match', async () => {
    const body = uploadedPayload(randomUUID());
    const res = makeRes();
    await handleRealtimeKitRecordingWebhook(
      makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), res as never,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).matched, false);
  });

  await t.test('a legal hold flag is never cleared by an UPLOADED webhook, even as the lifecycle state legitimately advances to stored', async () => {
    // legal_hold (private_data.call_recording_sessions.legal_hold) is a
    // separate boolean from the `state` lifecycle enum (see
    // services/recording-lifecycle.ts setRecordingLegalHold/
    // releaseRecordingLegalHold, which never touch `state`). A hold placed
    // while a recording is still uploading must not block -- and must not be
    // silently cleared by -- the normal uploading -> stored transition once
    // the file actually finishes uploading.
    const { recordingSessionId, providerRecordingId } = await seedRecordingSession('uploading', { legalHold: true });
    const body = uploadedPayload(providerRecordingId);
    const res = makeRes();
    await handleRealtimeKitRecordingWebhook(
      makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), res as never,
    );
    assert.equal(res.statusCode, 200);
    const sessionRow = await query<{ state: string; legal_hold: boolean }>(
      'SELECT state::text, legal_hold FROM private_data.call_recording_sessions WHERE id=$1', [recordingSessionId],
    );
    assert.equal(sessionRow.rows[0].state, 'stored', 'the lifecycle state must still advance once the file is actually uploaded');
    assert.equal(sessionRow.rows[0].legal_hold, true, 'the webhook must never clear an existing legal hold');
  });

  await t.test('an unrelated event type is acknowledged but never processed', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'meeting.started', meeting: { id: 'm1' } }));
    const res = makeRes();
    await handleRealtimeKitRecordingWebhook(
      makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), res as never,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).handled, false);
  });

  await t.test('the webhook response never contains the transient RealtimeKit download URLs or any secret', async () => {
    const { providerRecordingId } = await seedRecordingSession('uploading');
    const body = uploadedPayload(providerRecordingId);
    const res = makeRes();
    await handleRealtimeKitRecordingWebhook(
      makeRawReq(body, { 'rtk-signature': sign(body), 'rtk-uuid': randomUUID() }), res as never,
    );
    assert.doesNotMatch(res.body, /example\.com\/recording\.(mp4|mp3)/);
    assert.doesNotMatch(res.body, /downloadUrl/i);

    const auditMetadata = await query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM app.audit_logs WHERE action='recording_webhook_processed' ORDER BY id DESC LIMIT 1",
    );
    assert.doesNotMatch(JSON.stringify(auditMetadata.rows[0].metadata), /example\.com/);
  });
});
