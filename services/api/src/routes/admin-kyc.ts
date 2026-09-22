import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function applicationIdFrom(value: string): string {
  if (!UUID_RE.test(value)) throw new HttpError(400, 'invalid_application');
  return value;
}

export async function getListenerKycForAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  rawApplicationId: string,
) {
  await requireAdmin(req);
  const applicationId = applicationIdFrom(rawApplicationId);

  const result = await query<{
    application_id: string;
    user_id: string;
    application_status: string;
    kyc_status: string | null;
    rejected_reason_code: string | null;
    verified_at: string | null;
    kyc_created_at: string | null;
    kyc_updated_at: string | null;
    has_legal_name: boolean;
    has_national_id: boolean;
    has_date_of_birth: boolean;
    has_bank_iban: boolean;
    has_bank_holder: boolean;
  }>(`
    SELECT la.id::text application_id,
           la.user_id::text,
           la.status::text application_status,
           k.status::text kyc_status,
           k.rejected_reason_code,
           k.verified_at::text,
           k.created_at::text kyc_created_at,
           k.updated_at::text kyc_updated_at,
           (k.legal_name_ciphertext IS NOT NULL) has_legal_name,
           (k.national_id_ciphertext IS NOT NULL AND k.national_id_hash IS NOT NULL) has_national_id,
           (k.date_of_birth IS NOT NULL) has_date_of_birth,
           (k.bank_iban_ciphertext IS NOT NULL AND k.bank_iban_hash IS NOT NULL) has_bank_iban,
           (k.bank_account_holder_ciphertext IS NOT NULL) has_bank_holder
    FROM app.listener_applications la
    JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
    LEFT JOIN private_data.listener_kyc k ON k.user_id=la.user_id
    WHERE la.id=$1
  `, [applicationId]);

  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'listener_application_not_found');

  const checks = await query<{
    check_kind: string;
    status: string;
    provider: string | null;
    provider_reference: string | null;
    failure_code: string | null;
    requested_at: string | null;
    resolved_at: string | null;
  }>(`
    SELECT check_kind::text, status::text, provider, provider_reference, failure_code,
           requested_at::text, resolved_at::text
    FROM private_data.listener_kyc_checks
    WHERE user_id=$1
    ORDER BY check_kind
  `, [row.user_id]);

  sendJson(res, 200, {
    applicationId: row.application_id,
    userId: row.user_id,
    applicationStatus: row.application_status,
    status: row.kyc_status ?? 'not_started',
    rejectedReasonCode: row.rejected_reason_code,
    verifiedAt: row.verified_at,
    createdAt: row.kyc_created_at,
    updatedAt: row.kyc_updated_at,
    completeness: {
      legalName: row.has_legal_name,
      nationalId: row.has_national_id,
      dateOfBirth: row.has_date_of_birth,
      bankIban: row.has_bank_iban,
      bankAccountHolder: row.has_bank_holder,
    },
    // Auditable per-field evidence: what was checked, which provider, when,
    // the result, and the provider's own correlation reference only -- never
    // the raw provider response payload.
    checks: checks.rows.map((check) => ({
      checkKind: check.check_kind,
      status: check.status,
      provider: check.provider,
      providerReference: check.provider_reference,
      failureCode: check.failure_code,
      requestedAt: check.requested_at,
      resolvedAt: check.resolved_at,
    })),
  });
}

export async function reviewListenerKyc(
  req: IncomingMessage,
  res: ServerResponse,
  rawApplicationId: string,
) {
  const admin = await requireAdmin(req);
  const applicationId = applicationIdFrom(rawApplicationId);
  const body = await readJson<{ action?: unknown; reasonCode?: unknown }>(req);

  if (body.action !== 'reject' && body.action !== 'expire') {
    throw new HttpError(400, 'invalid_kyc_review_action');
  }
  const action = body.action;
  const reasonCode = typeof body.reasonCode === 'string' ? body.reasonCode.trim().toLowerCase() : '';
  if (!REASON_RE.test(reasonCode)) throw new HttpError(400, 'invalid_kyc_reason_code');

  const reviewed = await withTransaction(async (client) => {
    const application = await client.query<{
      id: string;
      user_id: string;
      status: string;
      kyc_status: string | null;
    }>(`
      SELECT la.id::text, la.user_id::text, la.status::text,
             k.status::text kyc_status
      FROM app.listener_applications la
      JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
      LEFT JOIN private_data.listener_kyc k ON k.user_id=la.user_id
      WHERE la.id=$1
      FOR UPDATE OF la
    `, [applicationId]);
    const row = application.rows[0];
    if (!row) throw new HttpError(404, 'listener_application_not_found');
    if (!row.kyc_status || row.kyc_status === 'not_started') throw new HttpError(409, 'kyc_not_submitted');
    if (row.kyc_status === 'verified') throw new HttpError(409, 'kyc_already_verified');
    if (row.kyc_status !== 'pending') throw new HttpError(409, 'kyc_not_pending');

    // Manual admin review may reject/expire evidence, but it can never create
    // a verified identity. Verification must come from the dedicated provider flow.
    const nextKycStatus = action === 'reject' ? 'rejected' : 'expired';
    const nextApplicationStatus = action === 'expire' ? 'kyc_expired' : 'kyc_pending';

    await client.query(`
      UPDATE private_data.listener_kyc
      SET status=$2, verified_at=NULL, rejected_reason_code=$3, updated_at=now()
      WHERE user_id=$1
    `, [row.user_id, nextKycStatus, reasonCode]);

    await client.query(`
      UPDATE app.listener_applications
      SET status=$2, updated_at=now()
      WHERE id=$1
    `, [row.id, nextApplicationStatus]);

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'listener_kyc_reviewed','listener_application',$2,
              jsonb_build_object('action',$3,'kycStatus',$4,'applicationStatus',$5,'reasonCode',$6,'adminRole',$7))
    `, [
      admin.userId,
      row.id,
      action,
      nextKycStatus,
      nextApplicationStatus,
      reasonCode,
      admin.adminRole,
    ]);

    return {
      applicationId: row.id,
      status: nextKycStatus,
      applicationStatus: nextApplicationStatus,
      reasonCode,
    };
  });

  sendJson(res, 200, { ok: true, ...reviewed });
}
