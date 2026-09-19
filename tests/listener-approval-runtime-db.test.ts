import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

const dbUrl = process.env.LISTENER_APPROVAL_RUNTIME_DB_URL;
const skip = dbUrl
  ? false
  : 'set LISTENER_APPROVAL_RUNTIME_DB_URL to a disposable non-production database (see scripts/run-listener-approval-runtime-db-test.sh)';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeReq(token: string | null, body: unknown = {}, url = '/') {
  const req = Readable.from([Buffer.from(JSON.stringify(body ?? {}))]) as Readable & {
    headers: Record<string, string>;
    url: string;
  };
  req.headers = token ? { authorization: `Bearer ${token}` } : {};
  req.url = url;
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

function parsed(res: ReturnType<typeof makeRes>) {
  return JSON.parse(res.body || '{}') as Record<string, any>;
}

test('W87 real Listener approval lifecycle', { skip }, async (t) => {
  process.env.DATABASE_URL = dbUrl;
  process.env.APP_ENV = 'local';
  process.env.VERCEL_ENV = '';

  const { query, closePool } = await import('../packages/db/src/client.ts');
  const { decideListenerApplication } = await import('../services/api/src/routes/admin-listener-approval.ts');
  const { acceptListenerAgreement } = await import('../services/api/src/routes/listener.ts');
  const { browseCallerListeners } = await import('../services/api/src/routes/caller-discovery.ts');

  t.after(async () => { await closePool(); });

  const serviceId = (await query<{ id: string }>(
    "SELECT id::text FROM app.service_catalog WHERE code='human_listening'",
  )).rows[0].id;
  const languageId = (await query<{ id: string }>(
    "SELECT id::text FROM app.languages WHERE code='fa'",
  )).rows[0].id;

  async function seedSession(userId: string, prefix: string): Promise<string> {
    const token = `${prefix}-${randomBytes(24).toString('hex')}`;
    await query(
      "INSERT INTO private_data.auth_sessions(user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '2 hours')",
      [userId, sha256Hex(token)],
    );
    return token;
  }

  async function seedAdmin(): Promise<{ userId: string; token: string }> {
    const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    await query("INSERT INTO app.admin_users(user_id,admin_role) VALUES ($1,'operations')", [userId]);
    return { userId, token: await seedSession(userId, 'w87-admin') };
  }

  async function seedOrdinaryUser(): Promise<{ userId: string; token: string }> {
    const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    return { userId, token: await seedSession(userId, 'w87-user') };
  }

  async function seedApplicant(
    status: string,
    options: { prerequisites?: boolean; maliciousPublicProfile?: boolean; nickname?: string } = {},
  ): Promise<{ userId: string; token: string; applicationId: string }> {
    const userId = (await query<{ id: string }>('INSERT INTO app.users DEFAULT VALUES RETURNING id::text')).rows[0].id;
    const token = await seedSession(userId, 'w87-listener');
    const nickname = options.nickname ?? `شنونده ${randomBytes(3).toString('hex')}`;
    const applicationId = (await query<{ id: string }>(`
      INSERT INTO app.listener_applications(
        user_id,service_id,status,nickname,declared_gender,short_intro,listening_style,submitted_at
      ) VALUES ($1,$2,$3::app.listener_application_status,$4,'female','معرفی تست','آرام',now())
      RETURNING id::text
    `, [userId, serviceId, status, nickname])).rows[0].id;
    await query(`
      INSERT INTO app.listener_application_languages(application_id,language_id,proficiency)
      VALUES ($1,$2,'fluent')
    `, [applicationId, languageId]);

    if (options.prerequisites) {
      await query(`
        INSERT INTO app.listener_assessment_attempts(
          application_id,result,score,scenario_version,answers,reviewed_at
        ) VALUES ($1,'passed',100,'w87-runtime','{}'::jsonb,now())
      `, [applicationId]);
      await query(`
        INSERT INTO private_data.listener_kyc(user_id,status,verified_at)
        VALUES ($1,'verified',now())
      `, [userId]);
      await query(`
        INSERT INTO private_data.listener_kyc_checks(
          user_id,check_kind,status,provider,provider_reference,requested_at,resolved_at
        ) VALUES
          ($1,'national_id_dob_match','verified','runtime_provider','ref-national',now()-interval '2 seconds',now()-interval '1 second'),
          ($1,'iban_inquiry','verified','runtime_provider','ref-iban',now()-interval '2 seconds',now()-interval '1 second')
      `, [userId]);
      if (status === 'admin_review' || status === 'approved' || status === 'active') {
        await query(`
          INSERT INTO app.consents(user_id,consent_type,version,granted,granted_at)
          VALUES ($1,'listener_rules','terms-2026-09-13',true,now())
        `, [userId]);
      }
    }

    if (options.maliciousPublicProfile) {
      await query(`
        INSERT INTO app.listener_profiles(user_id,nickname,gender,is_verified)
        VALUES ($1,$2,'female',true)
      `, [userId, nickname]);
      await query(`
        INSERT INTO app.listener_service_profiles(listener_user_id,service_id,short_intro,style_text,is_public)
        VALUES ($1,$2,'should stay hidden','test',true)
      `, [userId, serviceId]);
      await query(`
        INSERT INTO app.listener_languages(listener_user_id,language_id,proficiency)
        VALUES ($1,$2,'fluent')
      `, [userId, languageId]);
    }

    return { userId, token, applicationId };
  }

  async function callDecision(token: string | null, applicationId: string, decision: 'approve' | 'reject', reason?: string) {
    const res = makeRes();
    await decideListenerApplication(
      makeReq(token, { decision, ...(reason ? { reason } : {}) }),
      res as never,
      applicationId,
    );
    return { status: res.statusCode, payload: parsed(res) };
  }

  async function browse(token: string) {
    const res = makeRes();
    await browseCallerListeners(makeReq(token, {}, '/v1/listeners?online=false'), res as never);
    return { status: res.statusCode, payload: parsed(res) };
  }

  const admin = await seedAdmin();
  const nonAdmin = await seedOrdinaryUser();
  const caller = await seedOrdinaryUser();

  await t.test('agreement acceptance records evidence and stops at admin_review; no self-approval/profile creation', async () => {
    const applicant = await seedApplicant('agreement_pending', { prerequisites: true });
    const res = makeRes();
    await acceptListenerAgreement(makeReq(applicant.token, { accepted: true }), res as never);
    assert.equal(res.statusCode, 200);
    assert.equal(parsed(res).status, 'admin_review');

    const state = await query<{ status: string }>('SELECT status::text FROM app.listener_applications WHERE id=$1', [applicant.applicationId]);
    assert.equal(state.rows[0].status, 'admin_review');
    const consent = await query(`
      SELECT 1 FROM app.consents
      WHERE user_id=$1 AND consent_type='listener_rules' AND version='terms-2026-09-13' AND granted=true AND revoked_at IS NULL
    `, [applicant.userId]);
    assert.equal(consent.rowCount, 1);
    const profiles = await query('SELECT 1 FROM app.listener_profiles WHERE user_id=$1', [applicant.userId]);
    assert.equal(profiles.rowCount, 0, 'agreement acceptance must never self-approve/create a sellable profile');
    const audit = await query("SELECT 1 FROM app.audit_logs WHERE entity_id=$1 AND action='listener_rules_accepted'", [applicant.applicationId]);
    assert.equal(audit.rowCount, 1);
  });

  await t.test('KYC incomplete cannot approve', async () => {
    const applicant = await seedApplicant('admin_review');
    await assert.rejects(
      callDecision(admin.token, applicant.applicationId, 'approve'),
      (error: unknown) => {
        const e = error as { status?: number; code?: string };
        assert.equal(e.status, 409);
        assert.equal(e.code, 'listener_kyc_incomplete');
        return true;
      },
    );
    assert.equal((await query('SELECT 1 FROM app.listener_profiles WHERE user_id=$1', [applicant.userId])).rowCount, 0);
  });

  await t.test('ordinary authenticated user cannot approve', async () => {
    const applicant = await seedApplicant('admin_review', { prerequisites: true });
    await assert.rejects(
      callDecision(nonAdmin.token, applicant.applicationId, 'approve'),
      (error: unknown) => {
        const e = error as { status?: number; code?: string };
        assert.equal(e.status, 403);
        assert.equal(e.code, 'admin_required');
        return true;
      },
    );
  });

  await t.test('pending applicant cannot appear even if stale/malicious profile flags exist', async () => {
    const applicant = await seedApplicant('kyc_pending', { maliciousPublicProfile: true });
    const result = await browse(caller.token);
    assert.equal(result.status, 200);
    assert.equal(result.payload.listeners.some((item: any) => item.id === applicant.userId), false);
  });

  await t.test('admin approval is transactional, preserves field evidence, writes audit, and makes Listener discoverable', async () => {
    const applicant = await seedApplicant('admin_review', { prerequisites: true });
    const before = await query<{ check_kind: string; status: string; provider: string | null; provider_reference: string | null }>(`
      SELECT check_kind::text,status::text,provider,provider_reference
      FROM private_data.listener_kyc_checks WHERE user_id=$1 ORDER BY check_kind
    `, [applicant.userId]);

    const approved = await callDecision(admin.token, applicant.applicationId, 'approve');
    assert.equal(approved.status, 200);
    assert.equal(approved.payload.applicationStatus, 'approved');
    assert.equal(approved.payload.idempotent, false);

    const appState = await query<{ status: string; approved_at: string | null }>(
      'SELECT status::text,approved_at::text FROM app.listener_applications WHERE id=$1',
      [applicant.applicationId],
    );
    assert.equal(appState.rows[0].status, 'approved');
    assert.ok(appState.rows[0].approved_at);
    assert.equal((await query('SELECT 1 FROM app.listener_profiles WHERE user_id=$1 AND is_verified=true', [applicant.userId])).rowCount, 1);
    assert.equal((await query('SELECT 1 FROM app.listener_service_profiles WHERE listener_user_id=$1 AND service_id=$2 AND is_public=true', [applicant.userId, serviceId])).rowCount, 1);
    assert.equal((await query('SELECT 1 FROM app.listener_languages WHERE listener_user_id=$1 AND language_id=$2', [applicant.userId, languageId])).rowCount, 1);

    const after = await query<{ check_kind: string; status: string; provider: string | null; provider_reference: string | null }>(`
      SELECT check_kind::text,status::text,provider,provider_reference
      FROM private_data.listener_kyc_checks WHERE user_id=$1 ORDER BY check_kind
    `, [applicant.userId]);
    assert.deepEqual(after.rows, before.rows, 'approval must preserve field-level KYC evidence');

    const audit = await query("SELECT metadata FROM app.audit_logs WHERE entity_id=$1 AND action='listener_application_approved'", [applicant.applicationId]);
    assert.equal(audit.rowCount, 1);

    const discovery = await browse(caller.token);
    const publicListener = discovery.payload.listeners.find((item: any) => item.id === applicant.userId);
    assert.ok(publicListener, 'approved Listener must be discoverable');
    assert.equal(publicListener.workEligible, true);
    assert.equal(Object.prototype.hasOwnProperty.call(publicListener, 'verified'), false, 'public API must not make a generic verified claim');
  });

  await t.test('duplicate approval is idempotent and never duplicates profile or audit', async () => {
    const applicant = await seedApplicant('admin_review', { prerequisites: true });
    const first = await callDecision(admin.token, applicant.applicationId, 'approve');
    const second = await callDecision(admin.token, applicant.applicationId, 'approve');
    assert.equal(first.payload.idempotent, false);
    assert.equal(second.payload.idempotent, true);
    assert.equal((await query('SELECT count(*)::int count FROM app.listener_profiles WHERE user_id=$1', [applicant.userId])).rows[0].count, 1);
    assert.equal((await query("SELECT count(*)::int count FROM app.audit_logs WHERE entity_id=$1 AND action='listener_application_approved'", [applicant.applicationId])).rows[0].count, 1);
  });

  await t.test('concurrent approval creates exactly one listener profile and one non-idempotent transition', async () => {
    const applicant = await seedApplicant('admin_review', { prerequisites: true });
    const [a, b] = await Promise.all([
      callDecision(admin.token, applicant.applicationId, 'approve'),
      callDecision(admin.token, applicant.applicationId, 'approve'),
    ]);
    assert.deepEqual([a.payload.idempotent, b.payload.idempotent].sort(), [false, true]);
    const profileCount = await query<{ count: number }>('SELECT count(*)::int count FROM app.listener_profiles WHERE user_id=$1', [applicant.userId]);
    assert.equal(profileCount.rows[0].count, 1);
    const auditCount = await query<{ count: number }>("SELECT count(*)::int count FROM app.audit_logs WHERE entity_id=$1 AND action='listener_application_approved'", [applicant.applicationId]);
    assert.equal(auditCount.rows[0].count, 1);
  });

  await t.test('rejection is idempotent, blocks later approval and marketplace exposure', async () => {
    const applicant = await seedApplicant('admin_review', { prerequisites: true });
    const first = await callDecision(admin.token, applicant.applicationId, 'reject', 'insufficient_review_evidence');
    const second = await callDecision(admin.token, applicant.applicationId, 'reject', 'insufficient_review_evidence');
    assert.equal(first.payload.applicationStatus, 'rejected');
    assert.equal(first.payload.idempotent, false);
    assert.equal(second.payload.idempotent, true);

    await assert.rejects(
      callDecision(admin.token, applicant.applicationId, 'approve'),
      (error: unknown) => {
        const e = error as { status?: number; code?: string };
        assert.equal(e.status, 409);
        assert.equal(e.code, 'listener_application_rejected');
        return true;
      },
    );
    const discovery = await browse(caller.token);
    assert.equal(discovery.payload.listeners.some((item: any) => item.id === applicant.userId), false);
    const audit = await query("SELECT metadata FROM app.audit_logs WHERE entity_id=$1 AND action='listener_application_rejected'", [applicant.applicationId]);
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].metadata.reason, 'insufficient_review_evidence');
  });
});
