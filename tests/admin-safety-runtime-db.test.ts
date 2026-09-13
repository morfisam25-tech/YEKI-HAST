import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

// W36 / Task B — REAL runtime regression for the Safety Admin case lifecycle.
//
// W35 proved the prior tests were source-grep only: they matched a status string
// in source but never exercised the actual PostgreSQL `app.case_status` enum, so
// the enum drift (`in_review` written against an enum that only has `reviewing`)
// passed CI while failing at runtime with a Postgres enum error.
//
// This test drives the ACTUAL admin-safety route handler (requireAdmin +
// withTransaction + the enum-cast UPDATE) against a real, isolated PostgreSQL
// database whose schema is the canonical migration 0001. It proves the contract
// against the database, not the source text.
//
// It runs only when SAFETY_ADMIN_RUNTIME_DB_URL points at a disposable,
// NON-PRODUCTION database. `scripts/run-safety-admin-runtime-db-test.sh`
// provisions a throwaway local PostgreSQL 16 cluster and sets that variable.
// With no such database the test SKIPS (it never silently passes and never
// touches production).

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
  const res = {
    statusCode: 0,
    body: '',
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    end(chunk?: string) {
      this.body = chunk ?? '';
      return this;
    },
  };
  return res;
}

test('safety admin case lifecycle is compatible with the real app.case_status enum', { skip }, async (t) => {
  // Point the shared db client at the isolated database BEFORE it is imported.
  process.env.DATABASE_URL = dbUrl;

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const { actOnAdminSafetyCase } = await import('../services/api/src/routes/admin-safety.ts');

  t.after(async () => {
    await closePool();
  });

  async function callAction(
    token: string | null,
    kind: 'report' | 'event',
    id: string,
    action: 'claim' | 'resolve' | 'dismiss',
    resolutionCode?: string,
  ) {
    const res = makeRes();
    const body: Record<string, unknown> = { action };
    if (resolutionCode) body.resolutionCode = resolutionCode;
    await actOnAdminSafetyCase(makeReq(token, body), res as never, kind, id);
    return { status: res.statusCode, payload: JSON.parse(res.body || '{}') };
  }

  // --- seed an admin, a non-admin, and two open report cases -----------------
  const adminId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
  await query('INSERT INTO app.admin_users(user_id, admin_role) VALUES ($1, $2)', [adminId, 'safety']);
  const adminToken = `w36-admin-${randomBytes(24).toString('hex')}`;
  await query(
    "INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
    [adminId, sha256Hex(adminToken)],
  );

  const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
  const userToken = `w36-user-${randomBytes(24).toString('hex')}`;
  await query(
    "INSERT INTO private_data.auth_sessions(user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
    [userId, sha256Hex(userToken)],
  );

  const report1 = (await query<{ id: string }>(
    "INSERT INTO app.reports(reporter_user_id, category) VALUES ($1, 'harassment') RETURNING id::text",
    [userId],
  )).rows[0].id;
  const report2 = (await query<{ id: string }>(
    "INSERT INTO app.reports(reporter_user_id, category) VALUES ($1, 'threat') RETURNING id::text",
    [userId],
  )).rows[0].id;

  async function statusOf(id: string): Promise<string> {
    const r = await query<{ status: string }>('SELECT status::text FROM app.reports WHERE id=$1', [id]);
    return r.rows[0].status;
  }

  await t.test("canonical enum has 'reviewing' and rejects the drifted 'in_review'", async () => {
    await query("SELECT 'reviewing'::app.case_status"); // must not throw
    await assert.rejects(
      query("SELECT 'in_review'::app.case_status"),
      /invalid input value for enum|case_status/i,
      "the buggy 'in_review' value must be rejected by the real enum",
    );
  });

  await t.test('claim: open -> reviewing succeeds through the real handler', async () => {
    const { status, payload } = await callAction(adminToken, 'report', report1, 'claim');
    assert.equal(status, 200);
    assert.equal(payload.case.status, 'reviewing');
    assert.equal(payload.case.assignedAdminUserId, adminId);
    assert.equal(await statusOf(report1), 'reviewing');
  });

  await t.test('resolve: reviewing -> resolved succeeds', async () => {
    const { status, payload } = await callAction(adminToken, 'report', report1, 'resolve', 'handled_ok');
    assert.equal(status, 200);
    assert.equal(payload.case.status, 'resolved');
    assert.notEqual(payload.case.resolvedAt, null);
    assert.equal(await statusOf(report1), 'resolved');
  });

  await t.test('dismiss: reviewing -> dismissed succeeds', async () => {
    await callAction(adminToken, 'report', report2, 'claim');
    assert.equal(await statusOf(report2), 'reviewing');
    const { status, payload } = await callAction(adminToken, 'report', report2, 'dismiss', 'no_action_needed');
    assert.equal(status, 200);
    assert.equal(payload.case.status, 'dismissed');
    assert.equal(await statusOf(report2), 'dismissed');
  });

  await t.test('a closed case cannot be claimed again', async () => {
    await assert.rejects(
      callAction(adminToken, 'report', report1, 'claim'),
      (err: unknown) => {
        const e = err as { status?: number; code?: string };
        assert.equal(e.status, 409);
        assert.equal(e.code, 'safety_case_closed');
        return true;
      },
    );
    // unchanged in the database
    assert.equal(await statusOf(report1), 'resolved');
  });

  await t.test('a non-admin caller cannot mutate a safety case', async () => {
    const report3 = (await query<{ id: string }>(
      "INSERT INTO app.reports(reporter_user_id, category) VALUES ($1, 'scam') RETURNING id::text",
      [userId],
    )).rows[0].id;
    await assert.rejects(
      callAction(userToken, 'report', report3, 'claim'),
      (err: unknown) => {
        const e = err as { status?: number; code?: string };
        assert.equal(e.status, 403);
        assert.equal(e.code, 'admin_required');
        return true;
      },
    );
    assert.equal(await statusOf(report3), 'open'); // untouched
  });

  await t.test('an unauthenticated caller cannot mutate a safety case', async () => {
    await assert.rejects(
      callAction(null, 'report', report2, 'resolve', 'nope'),
      (err: unknown) => {
        const e = err as { status?: number; code?: string };
        assert.equal(e.status, 401);
        assert.equal(e.code, 'unauthorized');
        return true;
      },
    );
  });
});
