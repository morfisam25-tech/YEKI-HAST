import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

// W58 — real runtime regression for the recording core foundation against an
// isolated PostgreSQL schema (consent, provider orchestration, billing gate,
// hold/retention, admin capability + audit). Same pattern and rationale as
// tests/admin-safety-runtime-db.test.ts (W36): runs only when
// RECORDING_RUNTIME_DB_URL points at a disposable, non-production database.
// scripts/run-recording-runtime-db-test.sh provisions one and applies every
// migration except 0006 (Neon-only pg_cron, not available locally -- see that
// script's header and docs/W58_RECORDING_CORE_FOUNDATION.md for what this
// means the internet-voice.ts HTTP route wiring itself is verified by
// instead, since 0006 adds the voice_* columns those routes read).

const dbUrl = process.env.RECORDING_RUNTIME_DB_URL;
const skip = dbUrl
  ? false
  : 'set RECORDING_RUNTIME_DB_URL to a disposable non-production database (see scripts/run-recording-runtime-db-test.sh)';

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
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(JSON.stringify(next.json), { status: next.status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test('W58 recording core foundation runtime', { skip }, async (t) => {
  process.env.DATABASE_URL = dbUrl;
  process.env.CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID = '';
  process.env.CLOUDFLARE_REALTIMEKIT_APP_ID = '';
  process.env.CLOUDFLARE_REALTIMEKIT_API_TOKEN = '';

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const {
    recordCallRecordingConsent,
    requireBothPartyRecordingConsentForDispatch,
    startRecordingForCall,
    stopRecordingForCall,
    confirmRecordingActiveForBilling,
    setRecordingLegalHold,
    releaseRecordingLegalHold,
    listPurgeEligibleRecordingSessions,
  } = await import('../services/api/src/services/recording-lifecycle.ts');
  const { __resetRecordingProviderCacheForTests } = await import('../services/api/src/providers/recording.ts');
  const {
    getRecordingForSafetyCase,
    requestRecordingPlaybackGrant,
    setRecordingHold,
    releaseRecordingHold,
  } = await import('../services/api/src/routes/admin-recording.ts');
  const { recordingPlaybackGrantTtlSeconds } = await import('../services/api/src/lib/recording-config.ts');

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

  const REQUIRED_ENV = {
    APP_ENV: 'local',
    VERCEL_ENV: undefined,
    CALL_RECORDING_REQUIRED: 'true',
    CALL_RECORDING_PROVIDER: 'cloudflare_realtimekit',
    CALL_RECORDING_CONSENT_POLICY_VERSION: 'rec-2026-09-14-v1',
  } as const;

  // --- reference data seeded by migration 0001 -------------------------------
  const product = (await query<{ id: string }>("SELECT id::text FROM app.products WHERE code='yeki_hast'")).rows[0];
  const serviceRow = (await query<{ id: string }>("SELECT id::text FROM app.service_catalog WHERE code='human_listening'")).rows[0];
  const market = (await query<{ id: string }>("SELECT id::text FROM app.markets WHERE code='ir'")).rows[0];
  const language = (await query<{ id: string }>("SELECT id::text FROM app.languages WHERE code='fa'")).rows[0];
  const pricingPlan = (await query<{ id: string }>("SELECT id::text FROM app.pricing_plans WHERE is_active=true LIMIT 1")).rows[0];

  let callSeq = 0;
  async function seedCall(recordingMode: 'none' | 'all_with_consent'): Promise<{ callId: string; callerId: string; listenerId: string }> {
    callSeq += 1;
    const callerId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const listenerId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    await query("INSERT INTO app.listener_profiles(user_id, nickname, gender) VALUES ($1,'Test Listener','female')", [listenerId]);
    const call = await query<{ id: string }>(`
      INSERT INTO app.call_sessions(
        product_id, service_id, market_id, caller_market_id, caller_user_id, listener_user_id,
        client_request_id, status, requested_listener_gender, requested_language_id,
        pricing_plan_id, currency_code, caller_rate_per_minute_minor, listener_rate_per_minute_minor,
        listener_currency_code, authorized_minor, max_billable_seconds, recording_mode
      ) VALUES ($1,$2,$3,$3,$4,$5,$6,'calling_listener','any',$7,$8,'IRR',31000,21000,'IRR',0,600,$9::app.recording_mode)
      RETURNING id::text
    `, [product.id, serviceRow.id, market.id, callerId, listenerId, `w58-test-${callSeq}-${randomBytes(6).toString('hex')}`, language.id, pricingPlan.id, recordingMode]);
    return { callId: call.rows[0].id, callerId, listenerId };
  }

  async function seedAdmin(capability?: string): Promise<{ adminId: string; token: string }> {
    const adminId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    await query("INSERT INTO app.admin_users(user_id, admin_role) VALUES ($1,'safety')", [adminId]);
    const token = `w58-admin-${randomBytes(24).toString('hex')}`;
    await query("INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [adminId, sha256Hex(token)]);
    if (capability) {
      await query('INSERT INTO app.admin_capabilities(user_id, capability) VALUES ($1,$2)', [adminId, capability]);
    }
    return { adminId, token };
  }

  await t.test('both-party consent required: caller-only consent is insufficient for dispatch', async () => {
    await withEnv(REQUIRED_ENV, async () => {
      const { callId, callerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await assert.rejects(() => requireBothPartyRecordingConsentForDispatch(callId), /recording_consent_required/);
    });
  });

  await t.test('both-party consent required: both parties consenting satisfies dispatch', async () => {
    await withEnv(REQUIRED_ENV, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      const result = await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      assert.equal(result.bothPartiesConsented, true);
      await requireBothPartyRecordingConsentForDispatch(callId);
    });
  });

  await t.test('stale consent policy version is rejected', async () => {
    await withEnv(REQUIRED_ENV, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      await withEnv({ CALL_RECORDING_CONSENT_POLICY_VERSION: 'rec-2026-10-01-v2' }, async () => {
        await assert.rejects(() => requireBothPartyRecordingConsentForDispatch(callId), /recording_consent_required/);
      });
    });
  });

  await t.test('recording-required + missing provider credentials fails closed (never becomes active)', async () => {
    await withEnv(REQUIRED_ENV, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      const state = await startRecordingForCall(callId, 600);
      assert.equal(state, 'failed');
      const row = await query<{ state: string; failure_code: string | null }>(
        'SELECT state::text, failure_code FROM private_data.call_recording_sessions WHERE call_session_id=$1', [callId],
      );
      assert.equal(row.rows[0].state, 'failed');
      assert.equal(row.rows[0].failure_code, 'cloudflare_realtimekit_not_configured');
    });
  });

  await t.test('recording API error (200 but success:false) never counts as billing-active', async () => {
    await withEnv({ ...REQUIRED_ENV, CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc', CLOUDFLARE_REALTIMEKIT_APP_ID: 'app', CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'tok' }, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      const mock = mockFetchSequence([{ status: 200, json: { success: false } }]);
      try {
        const state = await startRecordingForCall(callId, 600);
        assert.equal(state, 'failed');
      } finally {
        mock.restore();
      }
      const gate = await confirmRecordingActiveForBilling({ query }, callId);
      assert.equal(gate.active, false);
    });
  });

  await t.test('an HTTP 200 start alone is not sufficient: only a confirmed RECORDING status is billing-active', async () => {
    await withEnv({ ...REQUIRED_ENV, CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc', CLOUDFLARE_REALTIMEKIT_APP_ID: 'app', CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'tok' }, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });

      const startMock = mockFetchSequence([
        { status: 200, json: { success: true, data: { id: 'meeting_1' } } },
        { status: 200, json: { success: true, data: { id: 'rec_1', status: 'INVOKED' } } },
      ]);
      let state: string;
      try {
        state = await startRecordingForCall(callId, 600);
      } finally {
        startMock.restore();
      }
      assert.equal(state, 'starting');

      const notYetMock = mockFetchSequence([{ status: 200, json: { success: true, data: { id: 'rec_1', status: 'INVOKED' } } }]);
      let gate: { active: boolean };
      try {
        gate = await confirmRecordingActiveForBilling({ query }, callId);
      } finally {
        notYetMock.restore();
      }
      assert.equal(gate.active, false, 'INVOKED alone must never be treated as billing-active');

      const nowActiveMock = mockFetchSequence([{ status: 200, json: { success: true, data: { id: 'rec_1', status: 'RECORDING' } } }]);
      try {
        gate = await confirmRecordingActiveForBilling({ query }, callId);
      } finally {
        nowActiveMock.restore();
      }
      assert.equal(gate.active, true);

      const cachedMock = mockFetchSequence([{ status: 200, json: { success: true, data: { id: 'rec_1', status: 'RECORDING' } } }]);
      try {
        await confirmRecordingActiveForBilling({ query }, callId);
      } finally {
        assert.equal(cachedMock.calls.length, 0, 'an already-confirmed recording state must not re-poll the provider');
        cachedMock.restore();
      }
    });
  });

  await t.test('duplicate start is idempotent: the provider is invoked once even if called twice', async () => {
    await withEnv({ ...REQUIRED_ENV, CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc', CLOUDFLARE_REALTIMEKIT_APP_ID: 'app', CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'tok' }, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      const mock = mockFetchSequence([
        { status: 200, json: { success: true, data: { id: 'meeting_1' } } },
        { status: 200, json: { success: true, data: { id: 'rec_1', status: 'RECORDING' } } },
      ]);
      try {
        const first = await startRecordingForCall(callId, 600);
        const callsAfterFirst = mock.calls.length;
        const second = await startRecordingForCall(callId, 600);
        assert.equal(first, 'recording');
        assert.equal(second, 'recording');
        assert.equal(mock.calls.length, callsAfterFirst, 'the provider must not be invoked again once recording is active');
      } finally {
        mock.restore();
      }
    });
  });

  await t.test('duplicate stop is idempotent', async () => {
    await withEnv({ ...REQUIRED_ENV, CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc', CLOUDFLARE_REALTIMEKIT_APP_ID: 'app', CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'tok' }, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      const startMock = mockFetchSequence([
        { status: 200, json: { success: true, data: { id: 'meeting_1' } } },
        { status: 200, json: { success: true, data: { id: 'rec_1', status: 'RECORDING' } } },
      ]);
      try { await startRecordingForCall(callId, 600); } finally { startMock.restore(); }

      const stopMock = mockFetchSequence([
        { status: 200, json: { success: true, data: { status: 'RECORDING' } } },
        { status: 200, json: { success: true, data: { status: 'UPLOADING' } } },
      ]);
      let firstStop: string;
      let secondStop: string;
      try {
        firstStop = await stopRecordingForCall(callId);
        secondStop = await stopRecordingForCall(callId);
      } finally {
        assert.equal(stopMock.calls.length, 2, 'one status check and at most one provider stop are allowed');
        stopMock.restore();
      }
      assert.equal(firstStop, 'uploading');
      assert.equal(secondStop, 'uploading');
    });
  });

  await t.test('automatic provider stop is reconciled without issuing a redundant stop request', async () => {
    await withEnv({ ...REQUIRED_ENV, CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc', CLOUDFLARE_REALTIMEKIT_APP_ID: 'app', CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'tok' }, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      const startMock = mockFetchSequence([
        { status: 200, json: { success: true, data: { id: 'meeting_1' } } },
        { status: 200, json: { success: true, data: { id: 'rec_1', status: 'RECORDING' } } },
      ]);
      try { await startRecordingForCall(callId, 60); } finally { startMock.restore(); }

      const statusMock = mockFetchSequence([
        { status: 200, json: { success: true, data: { status: 'UPLOADING' } } },
      ]);
      try {
        assert.equal(await stopRecordingForCall(callId), 'uploading');
        assert.equal(statusMock.calls.length, 1);
        assert.equal(statusMock.calls[0]?.method, 'GET');
        const persisted = await query<{ state: string; failure_code: string | null }>(`
          SELECT state::text, failure_code
          FROM private_data.call_recording_sessions
          WHERE call_session_id=$1
        `, [callId]);
        assert.deepEqual(persisted.rows[0], { state: 'uploading', failure_code: null });
      } finally {
        statusMock.restore();
      }
    });
  });

  await t.test('a provider failure during start is recorded with a failure code, not silently dropped', async () => {
    await withEnv({ ...REQUIRED_ENV, CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acc', CLOUDFLARE_REALTIMEKIT_APP_ID: 'app', CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'tok' }, async () => {
      const { callId, callerId, listenerId } = await seedCall('all_with_consent');
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
      const mock = mockFetchSequence([{ status: 500, json: { success: false } }]);
      try {
        const state = await startRecordingForCall(callId, 600);
        assert.equal(state, 'failed');
      } finally {
        mock.restore();
      }
    });
  });

  await t.test('Preview explicit recording-disabled behavior: consent/start are no-ops, never fabricate an active state', async () => {
    await withEnv({ ...REQUIRED_ENV, CALL_RECORDING_REQUIRED: 'false', CALL_RECORDING_PROVIDER: undefined, CALL_RECORDING_CONSENT_POLICY_VERSION: undefined }, async () => {
      const { callId, callerId } = await seedCall('none');
      const consent = await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      assert.equal(consent.policyVersion, 'not_applicable');
      assert.equal(consent.bothPartiesConsented, true);
      await requireBothPartyRecordingConsentForDispatch(callId);
      const state = await startRecordingForCall(callId, 600);
      assert.equal(state, 'not_requested');
      const gate = await confirmRecordingActiveForBilling({ query }, callId);
      assert.equal(gate.active, true, 'a call where recording is not required must never be blocked from billing');
    });
  });

  await t.test('retention hold overrides purge eligibility and is reversible', async () => {
    const { callId, callerId, listenerId } = await seedCall('all_with_consent');
    await withEnv(REQUIRED_ENV, async () => {
      await recordCallRecordingConsent({ callSessionId: callId, userId: callerId, role: 'caller', locale: 'fa-IR', clientVersion: 'test' });
      await recordCallRecordingConsent({ callSessionId: callId, userId: listenerId, role: 'listener', locale: 'fa-IR', clientVersion: 'test' });
    });
    const session = await query<{ id: string }>('SELECT id::text FROM private_data.call_recording_sessions WHERE call_session_id=$1', [callId]);
    const recordingSessionId = session.rows[0].id;
    await query(`UPDATE private_data.call_recording_sessions SET state='stored', purge_eligible_at=now() - interval '1 day' WHERE id=$1`, [recordingSessionId]);

    let eligible = await listPurgeEligibleRecordingSessions();
    assert.ok(eligible.some((s) => s.id === recordingSessionId));

    const { adminId } = await seedAdmin();
    await setRecordingLegalHold({ recordingSessionId, adminUserId: adminId, reasonCode: 'open_report', caseKind: 'report', caseId: randomBytes(16).toString('hex') });
    eligible = await listPurgeEligibleRecordingSessions();
    assert.ok(!eligible.some((s) => s.id === recordingSessionId), 'a legal hold must exclude the session from purge eligibility');

    await releaseRecordingLegalHold({ recordingSessionId, adminUserId: adminId });
    eligible = await listPurgeEligibleRecordingSessions();
    assert.ok(eligible.some((s) => s.id === recordingSessionId), 'releasing the hold must restore purge eligibility');
  });

  await t.test('admin playback grant: unauthorized (no capability) admin is rejected', async () => {
    const { callId } = await seedCall('all_with_consent');
    await query(`
      INSERT INTO private_data.call_recording_sessions(call_session_id, provider, state, consent_policy_version)
      VALUES ($1,'cloudflare_realtimekit','stored','rec-2026-09-14-v1')
    `, [callId]);
    const recordingSessionId = (await query<{ id: string }>('SELECT id::text FROM private_data.call_recording_sessions WHERE call_session_id=$1', [callId])).rows[0].id;
    const report = (await query<{ id: string }>(
      'INSERT INTO app.reports(reporter_user_id, category, call_session_id) VALUES ($1,$2,$3) RETURNING id::text',
      [(await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id, 'harassment', callId],
    )).rows[0];

    const { token } = await seedAdmin(); // no capability granted
    const res = makeRes();
    await assert.rejects(
      () => requestRecordingPlaybackGrant(makeReq(token, { caseKind: 'report', caseId: report.id, reasonCode: 'complaint_review' }), res as never, recordingSessionId),
      /admin_capability_required/,
    );
  });

  await t.test('admin playback grant: authorized admin is granted and the attempt is audited', async () => {
    const { callId } = await seedCall('all_with_consent');
    await query(`
      INSERT INTO private_data.call_recording_sessions(call_session_id, provider, state, consent_policy_version)
      VALUES ($1,'cloudflare_realtimekit','stored','rec-2026-09-14-v1')
    `, [callId]);
    const recordingSessionId = (await query<{ id: string }>('SELECT id::text FROM private_data.call_recording_sessions WHERE call_session_id=$1', [callId])).rows[0].id;
    const reporterId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const report = (await query<{ id: string }>(
      'INSERT INTO app.reports(reporter_user_id, category, call_session_id) VALUES ($1,$2,$3) RETURNING id::text',
      [reporterId, 'harassment', callId],
    )).rows[0];

    const { adminId, token } = await seedAdmin('recording_admin');
    const res = makeRes();
    await requestRecordingPlaybackGrant(makeReq(token, { caseKind: 'report', caseId: report.id, reasonCode: 'complaint_review' }), res as never, recordingSessionId);
    assert.equal(res.statusCode, 201);
    const payload = JSON.parse(res.body);
    assert.equal(payload.playbackUrl, null, 'no signed URL until archival storage is integrated');
    assert.ok(payload.grantId);

    const grantRow = await query('SELECT admin_user_id::text, reason_code FROM app.recording_playback_grants WHERE id=$1', [payload.grantId]);
    assert.equal(grantRow.rows[0].admin_user_id, adminId);
    assert.equal(grantRow.rows[0].reason_code, 'complaint_review');

    const audit = await query(
      "SELECT 1 FROM app.audit_logs WHERE action='admin_recording_playback_grant' AND entity_id=$1", [recordingSessionId],
    );
    assert.ok(audit.rowCount, 'every playback grant must leave an audit trail');

    // hold/release via the same admin capability
    const holdRes = makeRes();
    await setRecordingHold(makeReq(token, { caseKind: 'report', caseId: report.id, reasonCode: 'open_investigation' }), holdRes as never, recordingSessionId);
    assert.equal(holdRes.statusCode, 200);
    const held = await query<{ legal_hold: boolean }>('SELECT legal_hold FROM private_data.call_recording_sessions WHERE id=$1', [recordingSessionId]);
    assert.equal(held.rows[0].legal_hold, true);

    const releaseRes = makeRes();
    await releaseRecordingHold(makeReq(token, {}), releaseRes as never, recordingSessionId);
    assert.equal(releaseRes.statusCode, 200);
    const released = await query<{ legal_hold: boolean }>('SELECT legal_hold FROM private_data.call_recording_sessions WHERE id=$1', [recordingSessionId]);
    assert.equal(released.rows[0].legal_hold, false);
  });

  await t.test('a playback grant for a recording session that does not belong to the stated case is rejected', async () => {
    const { callId: realCallId } = await seedCall('all_with_consent');
    const { callId: otherCallId } = await seedCall('all_with_consent');
    await query(`INSERT INTO private_data.call_recording_sessions(call_session_id, provider, state, consent_policy_version) VALUES ($1,'cloudflare_realtimekit','stored','v1')`, [realCallId]);
    const recordingSessionId = (await query<{ id: string }>('SELECT id::text FROM private_data.call_recording_sessions WHERE call_session_id=$1', [realCallId])).rows[0].id;
    const reporterId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const unrelatedReport = (await query<{ id: string }>(
      'INSERT INTO app.reports(reporter_user_id, category, call_session_id) VALUES ($1,$2,$3) RETURNING id::text',
      [reporterId, 'harassment', otherCallId],
    )).rows[0];
    const { token } = await seedAdmin('recording_admin');
    const res = makeRes();
    await assert.rejects(
      () => requestRecordingPlaybackGrant(makeReq(token, { caseKind: 'report', caseId: unrelatedReport.id, reasonCode: 'complaint_review' }), res as never, recordingSessionId),
      /recording_case_mismatch/,
    );
  });

  // --- W81A additions: playback resolver boundary, capability audit depth,
  // reason-code/expiry validation, and no-secret-leakage. -----------------

  async function seedRecordingWithReport(): Promise<{ recordingSessionId: string; reportId: string; token: string }> {
    const { callId } = await seedCall('all_with_consent');
    await query(`
      INSERT INTO private_data.call_recording_sessions(call_session_id, provider, state, consent_policy_version)
      VALUES ($1,'cloudflare_realtimekit','stored','v1')
    `, [callId]);
    const recordingSessionId = (await query<{ id: string }>(
      'SELECT id::text FROM private_data.call_recording_sessions WHERE call_session_id=$1', [callId],
    )).rows[0].id;
    const reporterId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const report = (await query<{ id: string }>(
      'INSERT INTO app.reports(reporter_user_id, category, call_session_id) VALUES ($1,$2,$3) RETURNING id::text',
      [reporterId, 'harassment', callId],
    )).rows[0];
    const { token } = await seedAdmin('recording_admin');
    return { recordingSessionId, reportId: report.id, token };
  }

  await t.test('provider playback unavailable resolves to a controlled fail-closed result, never a fabricated URL', async () => {
    const { recordingSessionId, reportId, token } = await seedRecordingWithReport();
    const res = makeRes();
    await requestRecordingPlaybackGrant(
      makeReq(token, { caseKind: 'report', caseId: reportId, reasonCode: 'complaint_review' }), res as never, recordingSessionId,
    );
    assert.equal(res.statusCode, 201);
    const payload = JSON.parse(res.body);
    assert.equal(payload.playbackUrl, null);
    assert.deepEqual(payload.playback, { status: 'unavailable', reason: 'archival_storage_not_provisioned' });

    const resolvedAudit = await query(
      "SELECT metadata FROM app.audit_logs WHERE action='admin_recording_playback_resolved' AND entity_id=$1", [recordingSessionId],
    );
    assert.equal(resolvedAudit.rowCount, 1, 'the resolution attempt itself must be audited');
    assert.equal(resolvedAudit.rows[0].metadata.status, 'unavailable');

    const grantRow = await query<{ accessed_at: string | null }>(
      'SELECT accessed_at::text FROM app.recording_playback_grants WHERE id=$1', [payload.grantId],
    );
    assert.ok(grantRow.rows[0].accessed_at, 'a resolved playback attempt must record an access event');
  });

  await t.test('no provider token or secret ever appears in the playback grant API output', async () => {
    await withEnv({ CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'super-secret-token-should-never-leak' }, async () => {
      const { recordingSessionId, reportId, token } = await seedRecordingWithReport();
      const res = makeRes();
      await requestRecordingPlaybackGrant(
        makeReq(token, { caseKind: 'report', caseId: reportId, reasonCode: 'complaint_review' }), res as never, recordingSessionId,
      );
      assert.equal(res.statusCode, 201);
      assert.doesNotMatch(res.body, /super-secret-token-should-never-leak/);
      assert.doesNotMatch(res.body, /CLOUDFLARE_REALTIMEKIT_API_TOKEN/i);
    });
  });

  await t.test('a playback grant expires recordingPlaybackGrantTtlSeconds after authorization', async () => {
    await withEnv({ CALL_RECORDING_PLAYBACK_TTL_SECONDS: '120' }, async () => {
      const { recordingSessionId, reportId, token } = await seedRecordingWithReport();
      const res = makeRes();
      await requestRecordingPlaybackGrant(
        makeReq(token, { caseKind: 'report', caseId: reportId, reasonCode: 'complaint_review' }), res as never, recordingSessionId,
      );
      const payload = JSON.parse(res.body);
      const deltaSeconds = (Date.parse(payload.expiresAt) - Date.parse(payload.authorizedAt)) / 1000;
      assert.equal(Math.round(deltaSeconds), recordingPlaybackGrantTtlSeconds());
      assert.equal(recordingPlaybackGrantTtlSeconds(), 120);
    });
  });

  await t.test('a reason code is required for a playback grant and for setting a legal hold', async () => {
    const { recordingSessionId, reportId, token } = await seedRecordingWithReport();
    await assert.rejects(
      () => requestRecordingPlaybackGrant(makeReq(token, { caseKind: 'report', caseId: reportId }), makeRes() as never, recordingSessionId),
      /invalid_reason_code/,
    );
    await assert.rejects(
      () => setRecordingHold(makeReq(token, { caseKind: 'report', caseId: reportId }), makeRes() as never, recordingSessionId),
      /invalid_reason_code/,
    );
    await assert.rejects(
      () => setRecordingHold(makeReq(token, { caseKind: 'report', caseId: reportId, reasonCode: 'NOT VALID!' }), makeRes() as never, recordingSessionId),
      /invalid_reason_code/,
    );
  });

  await t.test('setting and releasing a legal hold are both audited', async () => {
    const { recordingSessionId, reportId, token } = await seedRecordingWithReport();
    await setRecordingHold(makeReq(token, { caseKind: 'report', caseId: reportId, reasonCode: 'open_investigation' }), makeRes() as never, recordingSessionId);
    const holdAudit = await query("SELECT 1 FROM app.audit_logs WHERE action='admin_recording_hold_set' AND entity_id=$1", [recordingSessionId]);
    assert.ok(holdAudit.rowCount, 'setting a legal hold must be audited');

    await releaseRecordingHold(makeReq(token, {}), makeRes() as never, recordingSessionId);
    const releaseAudit = await query("SELECT 1 FROM app.audit_logs WHERE action='admin_recording_hold_released' AND entity_id=$1", [recordingSessionId]);
    assert.ok(releaseAudit.rowCount, 'releasing a legal hold must be audited');
  });

  await t.test('legal hold review-due date is surfaced once the linked case closes, and withheld while it is open', async () => {
    const { recordingSessionId, reportId, token } = await seedRecordingWithReport();
    await setRecordingHold(makeReq(token, { caseKind: 'report', caseId: reportId, reasonCode: 'open_investigation' }), makeRes() as never, recordingSessionId);

    const openRes = makeRes();
    await getRecordingForSafetyCase(makeReq(token, {}), openRes as never, 'reports', reportId);
    const openPayload = JSON.parse(openRes.body);
    assert.equal(openPayload.recording.legalHold, true);
    assert.equal(openPayload.recording.legalHoldReviewDueAt, null, 'an open case has no review-due date yet');

    await query("UPDATE app.reports SET status='resolved', resolved_at=$2 WHERE id=$1", [reportId, '2026-01-01T00:00:00.000Z']);
    const closedRes = makeRes();
    await getRecordingForSafetyCase(makeReq(token, {}), closedRes as never, 'reports', reportId);
    const closedPayload = JSON.parse(closedRes.body);
    assert.equal(closedPayload.recording.legalHoldReviewDueAt, '2026-06-30T00:00:00.000Z');
  });

  // W89 P1 regression: an archived recording that no admin ever played back has
  // no persisted storage reference. A NULL reference must never be read as
  // "already deleted" -- the provider's output has to be located and really
  // deleted (or proven absent) before the session may be marked purged.
  await t.test('never-played archive is reconciled and really deleted before the session may become purged', async () => {
    const { purgeRecordingArchiveSession } = await import('../services/api/src/services/recording-archive.ts');

    const ARCHIVE_ENV = {
      CALL_RECORDING_ARCHIVE_R2_ENABLED: 'true',
      CALL_RECORDING_ARCHIVE_R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      CALL_RECORDING_ARCHIVE_R2_BUCKET: 'yeki-hast-archive-test',
      CALL_RECORDING_ARCHIVE_R2_PATH: 'listener-recordings-test',
      CALL_RECORDING_ARCHIVE_R2_ACCESS_KEY_ID: 'FAKEACCESSKEY',
      CALL_RECORDING_ARCHIVE_R2_SECRET_ACCESS_KEY: 'fake-secret-not-a-real-credential',
      CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID: 'acct',
      CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'token',
    };

    async function seedNeverPlayedArchive(providerOutputId: string): Promise<string> {
      const { callId } = await seedCall('all_with_consent');
      await query(
        "INSERT INTO private_data.call_recording_sessions(call_session_id, provider, state, consent_policy_version, purge_eligible_at, legal_hold)"
        + " VALUES ($1,'cloudflare_realtimekit','stored','rec-2026-09-14-v1', now() - interval '1 day', false)",
        [callId],
      );
      const recordingSessionId = (await query<{ id: string }>(
        'SELECT id::text FROM private_data.call_recording_sessions WHERE call_session_id=$1', [callId],
      )).rows[0].id;
      // Archived by the provider, but never played back, so reconciliation
      // never ran and no storage reference was ever persisted.
      await query(
        "INSERT INTO private_data.call_recording_segments(recording_session_id, provider_output_id, state, storage_reference_ciphertext, encryption_key_version)"
        + " VALUES ($1,$2,'stored',NULL,NULL)",
        [recordingSessionId, providerOutputId],
      );
      return recordingSessionId;
    }

    function mockArchiveFetch(providerStatus: string, outputFileName: string | null) {
      const deletes: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('r2.cloudflarestorage.com')) {
          if (method === 'DELETE') deletes.push(url);
          return new Response('', { status: method === 'DELETE' ? 204 : 200 });
        }
        return new Response(
          JSON.stringify({ id: 'provider-output', status: providerStatus, output_file_name: outputFileName }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as typeof fetch;
      return { deletes, restore: () => { globalThis.fetch = originalFetch; } };
    }

    async function readState(recordingSessionId: string) {
      return (await query<{
        session_state: string; purged_at: string | null; segment_state: string; has_ref: boolean;
      }>(
        'SELECT s.state::text AS session_state, s.purged_at::text, g.state::text AS segment_state,'
        + ' (g.storage_reference_ciphertext IS NOT NULL) AS has_ref'
        + ' FROM private_data.call_recording_sessions s'
        + ' JOIN private_data.call_recording_segments g ON g.recording_session_id=s.id WHERE s.id=$1',
        [recordingSessionId],
      )).rows[0];
    }

    await withEnv({ ...REQUIRED_ENV, ...ARCHIVE_ENV }, async () => {
      // The provider still holds the output: it must be deleted for real.
      const purgeable = await seedNeverPlayedArchive('11111111-1111-4111-8111-111111111111');
      const uploaded = mockArchiveFetch('UPLOADED', 'never-played.mp4');
      try {
        assert.equal(await purgeRecordingArchiveSession(purgeable, new Date()), 'purged');
        assert.equal(uploaded.deletes.length, 1, 'a never-played archive must still issue a real R2 delete');
        assert.match(
          uploaded.deletes[0],
          /listener-recordings-test\/never-played\.mp4/,
          'the delete must target the key reconciled from the provider output',
        );
      } finally {
        uploaded.restore();
      }
      const after = await readState(purgeable);
      assert.equal(after.session_state, 'purged');
      assert.ok(after.purged_at);
      assert.equal(after.segment_state, 'purged');
      assert.equal(after.has_ref, false);

      // The output is still in flight: absence is NOT proven, so the session
      // must stay unpurged rather than orphan a real object.
      const inFlight = await seedNeverPlayedArchive('22222222-2222-4222-8222-222222222222');
      const uploading = mockArchiveFetch('UPLOADING', null);
      try {
        assert.equal(await purgeRecordingArchiveSession(inFlight, new Date()), 'archive_unverified');
        assert.equal(uploading.deletes.length, 0, 'an unverifiable archive must not delete anything');
      } finally {
        uploading.restore();
      }
      const blocked = await readState(inFlight);
      assert.equal(blocked.session_state, 'stored', 'an unverifiable archive must never be marked purged');
      assert.equal(blocked.purged_at, null);
      assert.equal(blocked.segment_state, 'stored');
    });
  });
});
