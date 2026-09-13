import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

// W36 / Task D — REAL runtime proof of the admin safety suspension capability.
//
// Drives the actual setAdminUserSafetyLimitation route and the real requireAuth
// gate against an isolated PostgreSQL database (canonical migration 0001), proving
// that suspension reuses the existing app.users.status state, is admin-only,
// reason-coded, audited, idempotent, reversible, fail-closed (a suspended user
// can no longer authenticate — so cannot initiate calls or refresh listener
// presence), and mutates no wallet/report data.
//
// Runs only when SAFETY_ADMIN_RUNTIME_DB_URL points at a disposable non-production
// database (see scripts/run-safety-admin-runtime-db-test.sh); otherwise it SKIPS.

const dbUrl = process.env.SAFETY_ADMIN_RUNTIME_DB_URL;
const skip = dbUrl
  ? false
  : 'set SAFETY_ADMIN_RUNTIME_DB_URL to a disposable non-production database (see scripts/run-safety-admin-runtime-db-test.sh)';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeReq(token: string | null, body: unknown) {
  const req = Readable.from([Buffer.from(JSON.stringify(body ?? {}))]) as Readable & {
    headers: Record<string, string>;
  };
  req.headers = token ? { authorization: `Bearer ${token}` } : {};
  return req as unknown as import('node:http').IncomingMessage;
}

function makeRes() {
  return {
    statusCode: 0,
    body: '',
    writeHead(status: number) { this.statusCode = status; return this; },
    end(chunk?: string) { this.body = chunk ?? ''; return this; },
  };
}

test('admin safety suspension reuses app.users.status and is fail-closed, audited, reversible', { skip }, async (t) => {
  process.env.DATABASE_URL = dbUrl;

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const { setAdminUserSafetyLimitation } = await import('../services/api/src/routes/admin-safety-enforcement.ts');
  const { requireAuth } = await import('../services/api/src/lib/auth.ts');

  t.after(async () => { await closePool(); });

  async function newUser(status = 'active'): Promise<string> {
    return (await query<{ id: string }>(
      "INSERT INTO app.users(status) VALUES ($1::app.user_status) RETURNING id::text",
      [status],
    )).rows[0].id;
  }
  async function newSession(userId: string): Promise<string> {
    const token = `w36-${randomBytes(24).toString('hex')}`;
    await query(
      "INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
      [userId, sha256Hex(token)],
    );
    return token;
  }
  async function makeAdmin(userId: string): Promise<void> {
    await query("INSERT INTO app.admin_users(user_id, admin_role) VALUES ($1,'safety')", [userId]);
  }
  async function statusOf(userId: string): Promise<string> {
    return (await query<{ status: string }>('SELECT status::text FROM app.users WHERE id=$1', [userId])).rows[0].status;
  }
  async function auditCount(userId: string, action: string): Promise<number> {
    const r = await query<{ n: string }>(
      'SELECT count(*)::text n FROM app.audit_logs WHERE entity_id=$1 AND action=$2',
      [userId, action],
    );
    return Number(r.rows[0].n);
  }
  async function call(token: string | null, targetId: string, action: string, reasonCode?: string) {
    const res = makeRes();
    const body: Record<string, unknown> = { action };
    if (reasonCode !== undefined) body.reasonCode = reasonCode;
    await setAdminUserSafetyLimitation(makeReq(token, body), res as never, targetId);
    return { status: res.statusCode, payload: JSON.parse(res.body || '{}') };
  }

  const adminId = await newUser();
  await makeAdmin(adminId);
  const adminToken = await newSession(adminId);

  const target = await newUser();
  const targetToken = await newSession(target);

  await t.test('a valid session authenticates before suspension', async () => {
    const auth = await requireAuth(makeReq(targetToken, {}));
    assert.equal(auth.userId, target);
  });

  await t.test('reason code is required', async () => {
    await assert.rejects(call(adminToken, target, 'suspend'), (e: any) => {
      assert.equal(e.status, 400);
      assert.equal(e.code, 'invalid_reason_code');
      return true;
    });
  });

  await t.test('suspend flips the account to suspended, audited', async () => {
    const { status, payload } = await call(adminToken, target, 'suspend', 'safety_review');
    assert.equal(status, 200);
    assert.equal(payload.changed, true);
    assert.equal(payload.user.status, 'suspended');
    assert.equal(await statusOf(target), 'suspended');
    assert.equal(await auditCount(target, 'admin_safety_suspend'), 1);
  });

  await t.test('a suspended user can no longer authenticate (calls + presence blocked)', async () => {
    await assert.rejects(requireAuth(makeReq(targetToken, {})), (e: any) => {
      assert.equal(e.status, 401);
      return true;
    });
  });

  await t.test('suspend is idempotent (no state change, no duplicate audit)', async () => {
    const { status, payload } = await call(adminToken, target, 'suspend', 'safety_review');
    assert.equal(status, 200);
    assert.equal(payload.changed, false);
    assert.equal(await auditCount(target, 'admin_safety_suspend'), 1); // still 1
  });

  await t.test('unsuspend restores active and re-enables authentication (reversible)', async () => {
    const { status, payload } = await call(adminToken, target, 'unsuspend', 'safety_cleared');
    assert.equal(status, 200);
    assert.equal(payload.changed, true);
    assert.equal(await statusOf(target), 'active');
    const auth = await requireAuth(makeReq(targetToken, {}));
    assert.equal(auth.userId, target);
  });

  await t.test('a non-admin cannot suspend anyone', async () => {
    const other = await newUser();
    const otherToken = await newSession(other);
    await assert.rejects(call(otherToken, target, 'suspend', 'safety_review'), (e: any) => {
      assert.equal(e.status, 403);
      assert.equal(e.code, 'admin_required');
      return true;
    });
    assert.equal(await statusOf(target), 'active');
  });

  await t.test('an admin cannot suspend their own account', async () => {
    await assert.rejects(call(adminToken, adminId, 'suspend', 'safety_review'), (e: any) => {
      assert.equal(e.status, 409);
      assert.equal(e.code, 'cannot_suspend_self');
      return true;
    });
    assert.equal(await statusOf(adminId), 'active');
  });

  await t.test('an admin cannot suspend another active admin', async () => {
    const admin2 = await newUser();
    await makeAdmin(admin2);
    await assert.rejects(call(adminToken, admin2, 'suspend', 'safety_review'), (e: any) => {
      assert.equal(e.status, 409);
      assert.equal(e.code, 'cannot_suspend_admin');
      return true;
    });
    assert.equal(await statusOf(admin2), 'active');
  });

  await t.test('archived accounts are never touched by this tool', async () => {
    const archived = await newUser('archived');
    await assert.rejects(call(adminToken, archived, 'suspend', 'safety_review'), (e: any) => {
      assert.equal(e.status, 409);
      assert.equal(e.code, 'user_archived');
      return true;
    });
    assert.equal(await statusOf(archived), 'archived');
  });

  await t.test('suspension mutates no wallet balance and deletes no reports', async () => {
    const listener = await newUser();
    await query(
      "INSERT INTO app.wallets(user_id, currency_code, balance_minor) VALUES ($1,'IRR',123456)",
      [listener],
    );
    const reporter = await newUser();
    await query(
      "INSERT INTO app.reports(reporter_user_id, reported_user_id, category) VALUES ($1,$2,'harassment')",
      [reporter, listener],
    );
    await call(adminToken, listener, 'suspend', 'safety_review');
    const wallet = await query<{ balance_minor: string }>(
      "SELECT balance_minor::text FROM app.wallets WHERE user_id=$1 AND currency_code='IRR'",
      [listener],
    );
    assert.equal(wallet.rows[0].balance_minor, '123456');
    const reports = await query<{ n: string }>(
      'SELECT count(*)::text n FROM app.reports WHERE reported_user_id=$1',
      [listener],
    );
    assert.equal(Number(reports.rows[0].n), 1);
  });
});
