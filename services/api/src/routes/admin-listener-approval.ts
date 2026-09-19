import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { listenerKycChecksComplete, LISTENER_RULES_CONSENT_VERSION } from '../domain/listener-approval.ts';
import type { KycCheckKind, KycCheckStatus } from '../domain/kyc-verification.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import type { SqlClient } from '../lib/sql-client.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function applicationIdFrom(value: string): string {
  if (!UUID_RE.test(value)) throw new HttpError(400, 'invalid_application');
  return value;
}

function reviewReason(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_listener_review_reason');
  const reason = value.trim();
  if (!reason || reason.length > 500 || /\p{C}/u.test(reason)) throw new HttpError(400, 'invalid_listener_review_reason');
  return reason;
}

async function requireApprovalPrerequisites(client: SqlClient, userId: string): Promise<{
  checks: Array<{ checkKind: KycCheckKind; status: KycCheckStatus }>;
}> {
  const [kyc, checks, agreement, assessment] = await Promise.all([
    client.query<{ status: string }>(`
      SELECT status::text
      FROM private_data.listener_kyc
      WHERE user_id=$1
    `, [userId]),
    client.query<{ check_kind: KycCheckKind; status: KycCheckStatus }>(`
      SELECT check_kind::text AS check_kind, status::text AS status
      FROM private_data.listener_kyc_checks
      WHERE user_id=$1
      ORDER BY check_kind
    `, [userId]),
    client.query(`
      SELECT 1
      FROM app.consents
      WHERE user_id=$1
        AND consent_type='listener_rules'
        AND version=$2
        AND granted=true
        AND revoked_at IS NULL
      LIMIT 1
    `, [userId, LISTENER_RULES_CONSENT_VERSION]),
    client.query(`
      SELECT 1
      FROM app.listener_assessment_attempts a
      JOIN app.listener_applications la ON la.id=a.application_id
      JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
      WHERE la.user_id=$1 AND a.result='passed'
      ORDER BY a.reviewed_at DESC NULLS LAST, a.created_at DESC
      LIMIT 1
    `, [userId]),
  ]);

  if (kyc.rows[0]?.status !== 'verified') throw new HttpError(409, 'listener_kyc_incomplete');
  const normalizedChecks = checks.rows.map((row) => ({ checkKind: row.check_kind, status: row.status }));
  if (!listenerKycChecksComplete(normalizedChecks)) throw new HttpError(409, 'listener_kyc_incomplete');
  if (!agreement.rowCount) throw new HttpError(409, 'listener_agreement_required');
  if (!assessment.rowCount) throw new HttpError(409, 'listener_assessment_not_passed');
  return { checks: normalizedChecks };
}

async function activateApprovedProfile(
  client: SqlClient,
  application: {
    id: string;
    user_id: string;
    service_id: string;
    nickname: string;
    declared_gender: string;
    short_intro: string | null;
    listening_style: string | null;
  },
): Promise<void> {
  await client.query("INSERT INTO app.user_roles(user_id, role) VALUES ($1,'listener') ON CONFLICT DO NOTHING", [application.user_id]);

  // `is_verified` is a legacy schema column. In this workflow it is only the
  // internal approved/work-eligible account gate. Public discovery exposes
  // `workEligible`, never a generic identity-verification claim.
  // `reliability_score` deliberately uses the schema default on first insert;
  // approval does not invent or reset a quality score.
  await client.query(`
    INSERT INTO app.listener_profiles(user_id, nickname, gender, is_verified)
    VALUES ($1,$2,$3,true)
    ON CONFLICT (user_id) DO UPDATE SET
      nickname=EXCLUDED.nickname,
      gender=EXCLUDED.gender,
      is_verified=true,
      updated_at=now()
  `, [application.user_id, application.nickname, application.declared_gender]);

  await client.query(`
    INSERT INTO app.listener_service_profiles(listener_user_id, service_id, short_intro, style_text, is_public)
    VALUES ($1,$2,$3,$4,true)
    ON CONFLICT (listener_user_id, service_id) DO UPDATE SET
      short_intro=EXCLUDED.short_intro,
      style_text=EXCLUDED.style_text,
      is_public=true,
      updated_at=now()
  `, [application.user_id, application.service_id, application.short_intro, application.listening_style]);

  await client.query(`
    INSERT INTO app.listener_languages(listener_user_id, language_id, proficiency)
    SELECT $2, lal.language_id, lal.proficiency
    FROM app.listener_application_languages lal
    WHERE lal.application_id=$1
    ON CONFLICT (listener_user_id, language_id) DO UPDATE SET
      proficiency=EXCLUDED.proficiency
  `, [application.id, application.user_id]);
}

async function deactivateRejectedProfile(
  client: SqlClient,
  application: { user_id: string; service_id: string },
): Promise<void> {
  // Normally an admin_review applicant has no sellable profile yet. These
  // updates are a fail-closed backstop for stale/manual/pre-W87 rows: rejecting
  // an application must never leave an anomalous public profile eligible.
  await client.query(`
    UPDATE app.listener_service_profiles
    SET is_public=false, updated_at=now()
    WHERE listener_user_id=$1 AND service_id=$2 AND is_public=true
  `, [application.user_id, application.service_id]);
  await client.query(`
    UPDATE app.listener_profiles
    SET is_verified=false, updated_at=now()
    WHERE user_id=$1 AND is_verified=true
  `, [application.user_id]);
}

export async function decideListenerApplication(
  req: IncomingMessage,
  res: ServerResponse,
  rawApplicationId: string,
) {
  const admin = await requireAdmin(req);
  const applicationId = applicationIdFrom(rawApplicationId);
  const body = await readJson<{ decision?: unknown; reason?: unknown }>(req);
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    throw new HttpError(400, 'invalid_listener_review_decision');
  }
  const decision = body.decision;
  const reason = reviewReason(body.reason);
  if (decision === 'reject' && !reason) throw new HttpError(400, 'listener_rejection_reason_required');

  const result = await withTransaction(async (client) => {
    const applicationResult = await client.query<{
      id: string;
      user_id: string;
      service_id: string;
      status: string;
      nickname: string;
      declared_gender: string;
      short_intro: string | null;
      listening_style: string | null;
      approved_at: string | null;
    }>(`
      SELECT la.id::text, la.user_id::text, la.service_id::text, la.status::text,
             la.nickname, la.declared_gender::text, la.short_intro, la.listening_style,
             la.approved_at::text
      FROM app.listener_applications la
      JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
      WHERE la.id=$1
      FOR UPDATE OF la
    `, [applicationId]);
    const application = applicationResult.rows[0];
    if (!application) throw new HttpError(404, 'listener_application_not_found');

    if (decision === 'approve') {
      if (application.status === 'rejected') throw new HttpError(409, 'listener_application_rejected');
      if (application.status === 'suspended' || application.status === 'archived') {
        throw new HttpError(409, 'listener_application_not_approvable');
      }

      if (application.status === 'approved' || application.status === 'active') {
        await requireApprovalPrerequisites(client, application.user_id);
        await activateApprovedProfile(client, application);
        return { decision, applicationStatus: application.status, idempotent: true, reason: null };
      }
      if (application.status !== 'admin_review') throw new HttpError(409, 'listener_application_not_in_admin_review');

      const prerequisites = await requireApprovalPrerequisites(client, application.user_id);
      await activateApprovedProfile(client, application);
      await client.query(`
        UPDATE app.listener_applications
        SET status='approved', approved_at=COALESCE(approved_at,now()), updated_at=now()
        WHERE id=$1
      `, [application.id]);
      await client.query(`
        INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1,'listener_application_approved','listener_application',$2,
          jsonb_build_object(
            'adminRole',$3::text,
            'agreementVersion',$4::text,
            'profileActivated',true,
            'kycChecks',$5::jsonb
          ))
      `, [
        admin.userId,
        application.id,
        admin.adminRole,
        LISTENER_RULES_CONSENT_VERSION,
        JSON.stringify(prerequisites.checks),
      ]);
      return { decision, applicationStatus: 'approved', idempotent: false, reason: null };
    }

    if (application.status === 'rejected') {
      await deactivateRejectedProfile(client, application);
      return { decision, applicationStatus: 'rejected', idempotent: true, reason };
    }
    if (application.status === 'approved' || application.status === 'active') {
      throw new HttpError(409, 'listener_application_already_approved');
    }
    if (application.status !== 'admin_review') throw new HttpError(409, 'listener_application_not_in_admin_review');

    await deactivateRejectedProfile(client, application);
    await client.query(`
      UPDATE app.listener_applications
      SET status='rejected', approved_at=NULL, updated_at=now()
      WHERE id=$1
    `, [application.id]);
    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'listener_application_rejected','listener_application',$2,
              jsonb_build_object('adminRole',$3::text,'reason',$4::text,'profileDeactivated',true))
    `, [admin.userId, application.id, admin.adminRole, reason]);
    return { decision, applicationStatus: 'rejected', idempotent: false, reason };
  });

  sendJson(res, 200, { ok: true, applicationId, ...result });
}
