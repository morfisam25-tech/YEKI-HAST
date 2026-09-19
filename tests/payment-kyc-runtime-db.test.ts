import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

// W78 -- real runtime regression for (a) the Zibal/NextPay-generic wallet
// top-up path (callback tampering, duplicate callback, verify race, exactly-
// once credit) and (b) the Listener KYC field-check execution path, against
// an isolated PostgreSQL schema. Same pattern and rationale as
// tests/recording-runtime-db.test.ts (W58): runs only when
// PAYMENT_KYC_RUNTIME_DB_URL points at a disposable, non-production
// database. scripts/run-payment-kyc-runtime-db-test.sh provisions one.
//
// Source-text assertions (tests/payment-ledger-invariants.test.ts,
// tests/zibal-payment-provider.test.ts) already cover this logic without a
// live database; this file exists because a concurrent-verify race and an
// actual exactly-once ledger write are only provable against a real
// Postgres transaction/lock, not against source text.

const dbUrl = process.env.PAYMENT_KYC_RUNTIME_DB_URL;
const skip = dbUrl
  ? false
  : 'set PAYMENT_KYC_RUNTIME_DB_URL to a disposable non-production database (see scripts/run-payment-kyc-runtime-db-test.sh)';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeReq(token: string | null, body: unknown, url = '/') {
  const req = Readable.from([Buffer.from(JSON.stringify(body ?? {}))]) as Readable & {
    headers: Record<string, string>;
    url: string;
    method: string;
  };
  req.headers = token ? { authorization: `Bearer ${token}` } : {};
  req.url = url;
  req.method = 'POST';
  return req as unknown as import('node:http').IncomingMessage;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: '',
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    writeHead(status: number) { this.statusCode = status; return this; },
    end(chunk?: string) { this.body = chunk ?? ''; return this; },
  };
  return res as unknown as import('node:http').ServerResponse & { statusCode: number; body: string };
}

function jsonOf(res: { body: string }): any {
  return JSON.parse(res.body || '{}');
}

function mockFetchSequence(responses: Array<{ status: number; json: unknown }>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const originalFetch = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    let body: unknown = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = String(init?.body ?? ''); }
    calls.push({ url: String(input), body });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(JSON.stringify(next.json), { status: next.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test('W78 payment + KYC runtime DB', { skip }, async (t) => {
  process.env.DATABASE_URL = dbUrl;
  process.env.NODE_ENV = 'test';
  process.env.PAYMENT_PROVIDER = 'zibal';
  process.env.ZIBAL_MERCHANT = 'test-merchant';
  process.env.PAYMENT_CALLBACK_BASE_URL = 'https://preview.example.test';
  process.env.KYC_INQUIRY_PROVIDER = 'nextpay';
  process.env.NEXTPAY_INQUIRY_API = '11111111-1111-4111-8111-111111111111';
  process.env.ACTIVE_DATA_ENCRYPTION_KEY_ID = 'k1';
  process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ k1: randomBytes(32).toString('base64') });
  process.env.KYC_HASH_PEPPER = 'w78-test-pepper';

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const { createWalletTopup, verifyWalletTopup, zibalCallback } = await import('../services/api/src/routes/payments.ts');
  const { submitListenerKyc, getListenerKycStatus } = await import('../services/api/src/routes/kyc.ts');
  const { executeListenerKycVerification } = await import('../services/api/src/services/kyc-verification.ts');
  const { encryptPrivateText, kycLookupHash } = await import('../services/api/src/lib/security.ts');

  t.after(async () => { await closePool(); });

  async function seedUser(): Promise<{ userId: string; token: string }> {
    const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const token = `w78-user-${randomBytes(24).toString('hex')}`;
    await query("INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [userId, sha256Hex(token)]);
    return { userId, token };
  }

  // --- Zibal wallet top-up: callback tampering, duplicate callback, race, exactly-once credit ---

  await t.test('successful create -> verify credits exactly once; a second verify is idempotent, not a second credit', async () => {
    const { userId, token } = await seedUser();
    const mock = mockFetchSequence([{ status: 200, json: { result: 100, trackId: 700001 } }]);
    let created: ReturnType<typeof makeRes>;
    try {
      const req = makeReq(token, { amountMinor: 50000, idempotencyKey: 'topup-001' });
      created = makeRes();
      await createWalletTopup(req, created);
    } finally { mock.restore(); }
    assert.equal(created.statusCode, 201);
    const attemptId = jsonOf(created).attemptId;

    const verifyMock = mockFetchSequence([{ status: 200, json: { result: 100, status: 1, orderId: attemptId, amount: 50000, refNumber: 900001 } }]);
    let firstVerify: ReturnType<typeof makeRes>;
    try {
      firstVerify = makeRes();
      await verifyWalletTopup(makeReq(token, {}), firstVerify, attemptId);
    } finally { verifyMock.restore(); }
    assert.equal(jsonOf(firstVerify).status, 'succeeded');
    const balanceAfterFirst = jsonOf(firstVerify).balanceMinor;

    const wallet = await query<{ balance_minor: string }>(
      "SELECT balance_minor::text FROM app.wallets WHERE user_id=$1 AND currency_code='IRR'", [userId],
    );
    assert.equal(wallet.rows[0].balance_minor, '50000');

    // Second verify call (e.g. user refresh, duplicate client retry) must not
    // touch fetch again and must not double-credit.
    const secondVerifyMock = mockFetchSequence([{ status: 500, json: {} }]);
    let secondVerify: ReturnType<typeof makeRes>;
    try {
      secondVerify = makeRes();
      await verifyWalletTopup(makeReq(token, {}), secondVerify, attemptId);
    } finally { secondVerifyMock.restore(); }
    assert.equal(jsonOf(secondVerify).idempotent, true);
    assert.equal(jsonOf(secondVerify).balanceMinor, balanceAfterFirst);
    assert.equal(secondVerifyMock.calls.length, 0);

    const walletAfter = await query<{ balance_minor: string }>(
      "SELECT balance_minor::text FROM app.wallets WHERE user_id=$1 AND currency_code='IRR'", [userId],
    );
    assert.equal(walletAfter.rows[0].balance_minor, '50000');

    const ledgerCount = await query<{ count: string }>(
      "SELECT COUNT(*)::text FROM app.wallet_transactions WHERE payment_attempt_id=$1 AND type='payment_topup'", [attemptId],
    );
    assert.equal(ledgerCount.rows[0].count, '1');
  });

  await t.test('a callback with a tampered/unknown trackId never resolves to any real attempt', async () => {
    const res = makeRes();
    await assert.rejects(
      () => zibalCallback(makeReq(null, {}, '/v1/payments/zibal/callback?trackId=999999999'), res),
      /invalid_payment_callback/,
    );
  });

  await t.test('a duplicate/replayed callback for an already-succeeded attempt renders the same succeeded page without re-crediting', async () => {
    const { userId, token } = await seedUser();
    const mock = mockFetchSequence([{ status: 200, json: { result: 100, trackId: 700002 } }]);
    let created: ReturnType<typeof makeRes>;
    try {
      created = makeRes();
      await createWalletTopup(makeReq(token, { amountMinor: 12000, idempotencyKey: 'topup-002' }), created);
    } finally { mock.restore(); }
    const attemptId = jsonOf(created).attemptId;

    const verifyMock = mockFetchSequence([{ status: 200, json: { result: 100, status: 1, orderId: attemptId, amount: 12000, refNumber: 900002 } }]);
    try {
      await verifyWalletTopup(makeReq(token, {}), makeRes(), attemptId);
    } finally { verifyMock.restore(); }

    // Simulate the provider redirecting the browser to the callback URL
    // again (duplicate/replayed callback) after verify already succeeded.
    const callbackMock = mockFetchSequence([{ status: 500, json: {} }]);
    let callbackRes: ReturnType<typeof makeRes>;
    try {
      callbackRes = makeRes();
      await zibalCallback(makeReq(null, {}, `/v1/payments/zibal/callback?trackId=700002`), callbackRes);
    } finally { callbackMock.restore(); }
    assert.equal(callbackRes.statusCode, 200);
    assert.equal(callbackMock.calls.length, 0, 'an already-succeeded attempt must never re-invoke the provider');

    const wallet = await query<{ balance_minor: string }>(
      "SELECT balance_minor::text FROM app.wallets WHERE user_id=$1 AND currency_code='IRR'", [userId],
    );
    assert.equal(wallet.rows[0].balance_minor, '12000');
  });

  await t.test('concurrent verify calls on the same pending attempt still credit exactly once', async () => {
    const { userId, token } = await seedUser();
    const mock = mockFetchSequence([{ status: 200, json: { result: 100, trackId: 700003 } }]);
    let created: ReturnType<typeof makeRes>;
    try {
      created = makeRes();
      await createWalletTopup(makeReq(token, { amountMinor: 30000, idempotencyKey: 'topup-003' }), created);
    } finally { mock.restore(); }
    const attemptId = jsonOf(created).attemptId;

    // Two "concurrent" verify calls (callback race + explicit client verify)
    // racing against the same provider response.
    const verifyMock = mockFetchSequence([
      { status: 200, json: { result: 100, status: 1, orderId: attemptId, amount: 30000, refNumber: 900003 } },
      { status: 200, json: { result: 100, status: 1, orderId: attemptId, amount: 30000, refNumber: 900003 } },
    ]);
    let resA: ReturnType<typeof makeRes>;
    let resB: ReturnType<typeof makeRes>;
    try {
      [resA, resB] = await Promise.all([
        (async () => { const r = makeRes(); await verifyWalletTopup(makeReq(token, {}), r, attemptId); return r; })(),
        (async () => { const r = makeRes(); await verifyWalletTopup(makeReq(token, {}), r, attemptId); return r; })(),
      ]);
    } finally { verifyMock.restore(); }

    assert.equal(jsonOf(resA).ok, true);
    assert.equal(jsonOf(resB).ok, true);
    const idempotentCount = [resA, resB].filter((r) => jsonOf(r).idempotent).length;
    assert.equal(idempotentCount, 1, 'exactly one of the two racing verifies should observe the row already credited');

    const wallet = await query<{ balance_minor: string }>(
      "SELECT balance_minor::text FROM app.wallets WHERE user_id=$1 AND currency_code='IRR'", [userId],
    );
    assert.equal(wallet.rows[0].balance_minor, '30000');
    const ledgerCount = await query<{ count: string }>(
      "SELECT COUNT(*)::text FROM app.wallet_transactions WHERE payment_attempt_id=$1 AND type='payment_topup'", [attemptId],
    );
    assert.equal(ledgerCount.rows[0].count, '1');
  });

  await t.test('a verified amount that does not match the stored attempt amount is rejected, never credited (amount integrity)', async () => {
    const { token } = await seedUser();
    const mock = mockFetchSequence([{ status: 200, json: { result: 100, trackId: 700004 } }]);
    let created: ReturnType<typeof makeRes>;
    try {
      created = makeRes();
      await createWalletTopup(makeReq(token, { amountMinor: 15000, idempotencyKey: 'topup-004' }), created);
    } finally { mock.restore(); }
    const attemptId = jsonOf(created).attemptId;

    // Provider claims a *different* amount than what this attempt actually
    // requested -- must never be interpreted as this amount succeeding.
    const verifyMock = mockFetchSequence([{ status: 200, json: { result: 100, status: 1, orderId: attemptId, amount: 999999, refNumber: 900004 } }]);
    try {
      await assert.rejects(
        () => verifyWalletTopup(makeReq(token, {}), makeRes(), attemptId),
        /payment_verification_mismatch/,
      );
    } finally { verifyMock.restore(); }

    const attempt = await query<{ status: string }>('SELECT status::text FROM app.payment_attempts WHERE id=$1', [attemptId]);
    assert.equal(attempt.rows[0].status, 'pending');
    const ledgerCount = await query<{ count: string }>(
      "SELECT COUNT(*)::text FROM app.wallet_transactions WHERE payment_attempt_id=$1", [attemptId],
    );
    assert.equal(ledgerCount.rows[0].count, '0');
  });

  await t.test('a provider timeout/unreachable response leaves the attempt pending, never fails or credits it', async () => {
    const { token } = await seedUser();
    const mock = mockFetchSequence([{ status: 200, json: { result: 100, trackId: 700005 } }]);
    let created: ReturnType<typeof makeRes>;
    try {
      created = makeRes();
      await createWalletTopup(makeReq(token, { amountMinor: 8000, idempotencyKey: 'topup-005' }), created);
    } finally { mock.restore(); }
    const attemptId = jsonOf(created).attemptId;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('network unreachable'); }) as typeof fetch;
    try {
      await assert.rejects(() => verifyWalletTopup(makeReq(token, {}), makeRes(), attemptId), /payment_verification_unavailable/);
    } finally { globalThis.fetch = originalFetch; }

    const attempt = await query<{ status: string }>('SELECT status::text FROM app.payment_attempts WHERE id=$1', [attemptId]);
    assert.equal(attempt.rows[0].status, 'pending');
  });

  await t.test('a failed/cancelled attempt is terminal and never credited by a later retry', async () => {
    const { token } = await seedUser();
    const mock = mockFetchSequence([{ status: 200, json: { result: 100, trackId: 700006 } }]);
    let created: ReturnType<typeof makeRes>;
    try {
      created = makeRes();
      await createWalletTopup(makeReq(token, { amountMinor: 9000, idempotencyKey: 'topup-006' }), created);
    } finally { mock.restore(); }
    const attemptId = jsonOf(created).attemptId;

    const failMock = mockFetchSequence([{ status: 200, json: { result: -2, status: 2, orderId: attemptId, amount: 9000 } }]);
    let failRes: ReturnType<typeof makeRes>;
    try {
      failRes = makeRes();
      await verifyWalletTopup(makeReq(token, {}), failRes, attemptId);
    } finally { failMock.restore(); }
    assert.equal(jsonOf(failRes).status, 'failed');

    // Retry after terminal failure must short-circuit before ever touching the provider again.
    const retryMock = mockFetchSequence([{ status: 500, json: {} }]);
    let retryRes: ReturnType<typeof makeRes>;
    try {
      retryRes = makeRes();
      await verifyWalletTopup(makeReq(token, {}), retryRes, attemptId);
    } finally { retryMock.restore(); }
    assert.equal(jsonOf(retryRes).status, 'failed');
    assert.equal(retryMock.calls.length, 0);
  });

  // --- Listener KYC field-check execution ---

  async function seedListenerApplicationAtKycPending(): Promise<{ userId: string }> {
    const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const serviceId = (await query<{ id: string }>("SELECT id::text FROM app.service_catalog WHERE code='human_listening'")).rows[0].id;
    await query(`
      INSERT INTO app.listener_applications(user_id, service_id, status, nickname, declared_gender)
      VALUES ($1,$2,'kyc_pending','Test Listener','female')
    `, [userId, serviceId]);
    return { userId };
  }

  async function submitKyc(userId: string, token: string, overrides: Partial<{ nationalId: string; bankIban: string; dobJalali: string }> = {}) {
    const req = makeReq(token, {
      legalName: 'Test Listener Name',
      nationalId: overrides.nationalId ?? '0499370899',
      dateOfBirthJalali: overrides.dobJalali ?? '1370-05-21',
      bankIban: overrides.bankIban ?? 'IR820540102680020817909002',
    });
    const res = makeRes();
    await submitListenerKyc(req, res);
    return res;
  }

  // submitListenerKyc itself refuses the submission entirely (503) when the
  // inquiry provider isn't configured (requireKycSubmissionProvider gates
  // before any row is written) -- so exercising executeListenerKycVerification's
  // own fail-closed "provider not configured" branch means seeding a pending
  // row directly, the same state a later config regression could leave behind.
  await t.test('KYC provider not configured: execution records every required check as an explicit error, never verified', async () => {
    const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    // Distinct from the other KYC tests' national IDs -- raw SQL insert
    // bypasses submitListenerKyc's own checksum validation, so uniqueness
    // (not checksum validity) is all that matters here.
    const nationalId = '9999999999';
    const iban = 'IR820540102680020817909009';
    await query(`
      INSERT INTO private_data.listener_kyc(user_id, status, legal_name_ciphertext, national_id_ciphertext, national_id_hash, date_of_birth, bank_iban_ciphertext, bank_iban_hash, bank_account_holder_ciphertext)
      VALUES ($1,'pending',$2,$3,$4,'1991-08-12',$5,$6,$7)
    `, [
      userId,
      encryptPrivateText('Test Listener Name', `listener_kyc:legal_name:${userId}`),
      encryptPrivateText(nationalId, `listener_kyc:national_id:${userId}`),
      kycLookupHash('national_id', nationalId),
      encryptPrivateText(iban, `listener_kyc:bank_iban:${userId}`),
      kycLookupHash('bank_iban', iban),
      encryptPrivateText('Test Listener Name', `listener_kyc:bank_holder:${userId}`),
    ]);

    const previousProvider = process.env.KYC_INQUIRY_PROVIDER;
    delete process.env.KYC_INQUIRY_PROVIDER;
    try {
      const outcome = await executeListenerKycVerification(userId);
      assert.equal(outcome.status, 'pending');
    } finally {
      process.env.KYC_INQUIRY_PROVIDER = previousProvider;
    }

    const checks = await query<{ check_kind: string; status: string; failure_code: string }>(
      'SELECT check_kind::text, status::text, failure_code FROM private_data.listener_kyc_checks WHERE user_id=$1 ORDER BY check_kind', [userId],
    );
    assert.equal(checks.rows.length, 2);
    for (const check of checks.rows) {
      assert.equal(check.status, 'error');
      assert.equal(check.failure_code, 'kyc_provider_not_configured');
    }
    const kyc = await query<{ status: string }>('SELECT status::text FROM private_data.listener_kyc WHERE user_id=$1', [userId]);
    assert.equal(kyc.rows[0].status, 'pending');
  });

  await t.test('both field checks pass: KYC transitions to verified exactly once, with an audit log entry', async () => {
    const { userId } = await seedListenerApplicationAtKycPending();
    const token = `w78-user-${randomBytes(24).toString('hex')}`;
    await query("INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [userId, sha256Hex(token)]);

    const mock = mockFetchSequence([
      { status: 200, json: { code: 200, error: null, fee: 0, fee_irr: 0, inq_balance: 0, inq_balance_irr: 0, data: { inq: 'ok', inq_desc: 'ok', inq_id: 555, national_id: '0499370899', jalali_birth: '1370-05-21', match: true, first_name: 'a', last_name: 'b', father_name: 'c', is_alive: 1 } } },
      { status: 200, json: { code: 200, error: null, fee: 0, fee_irr: 0, inq_balance: 0, inq_balance_irr: 0, data: { sheba_ok: true } } },
    ]);
    let res: ReturnType<typeof makeRes>;
    try {
      res = await submitKyc(userId, token);
    } finally { mock.restore(); }
    assert.equal(res.statusCode, 202);
    assert.equal(jsonOf(res).status, 'verified');

    const kyc = await query<{ status: string; verified_at: string | null }>(
      'SELECT status::text, verified_at::text FROM private_data.listener_kyc WHERE user_id=$1', [userId],
    );
    assert.equal(kyc.rows[0].status, 'verified');
    assert.ok(kyc.rows[0].verified_at);

    const checks = await query<{ check_kind: string; status: string }>(
      'SELECT check_kind::text, status::text FROM private_data.listener_kyc_checks WHERE user_id=$1 ORDER BY check_kind', [userId],
    );
    assert.deepEqual(checks.rows.map((r) => `${r.check_kind}:${r.status}`).sort(), ['iban_inquiry:verified', 'national_id_dob_match:verified']);

    const audit = await query<{ count: string }>(
      "SELECT COUNT(*)::text FROM app.audit_logs WHERE actor_user_id=$1 AND action='listener_kyc_field_checks_verified'", [userId],
    );
    assert.equal(audit.rows[0].count, '1');

    // Public status endpoint must expose field-level evidence, not just the aggregate.
    const statusRes = makeRes();
    await getListenerKycStatus(makeReq(token, {}), statusRes);
    const statusBody = jsonOf(statusRes);
    assert.equal(statusBody.status, 'verified');
    assert.equal(statusBody.checks.length, 2);
    assert.ok(statusBody.checks.every((c: { checkKind: string }) => ['national_id_dob_match', 'iban_inquiry'].includes(c.checkKind)));
  });

  await t.test('a genuine national-id/DOB mismatch fails that one check and keeps KYC pending, never verified', async () => {
    const { userId } = await seedListenerApplicationAtKycPending();
    const token = `w78-user-${randomBytes(24).toString('hex')}`;
    await query("INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [userId, sha256Hex(token)]);

    const mock = mockFetchSequence([
      { status: 200, json: { code: 200, error: null, fee: 0, fee_irr: 0, inq_balance: 0, inq_balance_irr: 0, data: { inq: 'ok', inq_desc: 'ok', inq_id: 556, national_id: '0013546759', jalali_birth: '1370-05-21', match: false, first_name: 'a', last_name: 'b', father_name: 'c', is_alive: 1 } } },
      { status: 200, json: { code: 200, error: null, fee: 0, fee_irr: 0, inq_balance: 0, inq_balance_irr: 0, data: { sheba_ok: true } } },
    ]);
    let res: ReturnType<typeof makeRes>;
    try {
      res = await submitKyc(userId, token, { nationalId: '0013546759' });
    } finally { mock.restore(); }
    assert.equal(jsonOf(res).status, 'pending');

    const kyc = await query<{ status: string }>('SELECT status::text FROM private_data.listener_kyc WHERE user_id=$1', [userId]);
    assert.equal(kyc.rows[0].status, 'pending');

    const checks = await query<{ check_kind: string; status: string; failure_code: string | null }>(
      'SELECT check_kind::text, status::text, failure_code FROM private_data.listener_kyc_checks WHERE user_id=$1 ORDER BY check_kind', [userId],
    );
    const nationalIdCheck = checks.rows.find((c) => c.check_kind === 'national_id_dob_match')!;
    assert.equal(nationalIdCheck.status, 'failed');
    assert.equal(nationalIdCheck.failure_code, 'kyc_national_id_dob_mismatch');
  });
});
