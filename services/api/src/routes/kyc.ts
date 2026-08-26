import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import {
  isValidIranIban,
  isValidIranNationalId,
  normalizeIranIban,
  normalizeIranNationalId,
  normalizeIsoDate,
} from '../domain/iran-identifiers.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { encryptPrivateText, kycLookupHash } from '../lib/security.ts';

function normalizeLegalName(value: unknown, field = 'legalName'): string {
  const name = requireString(value, field, 2, 160).replace(/\s+/g, ' ');
  if (/\p{C}/u.test(name)) throw new HttpError(400, 'invalid_legal_name');
  return name;
}

export async function submitListenerKyc(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{
    legalName?: unknown;
    nationalId?: unknown;
    dateOfBirth?: unknown;
    bankIban?: unknown;
    bankAccountHolder?: unknown;
  }>(req);

  const legalName = normalizeLegalName(body.legalName);
  const rawNationalId = requireString(body.nationalId, 'nationalId', 10, 32);
  const nationalId = normalizeIranNationalId(rawNationalId);
  if (!isValidIranNationalId(nationalId)) throw new HttpError(400, 'invalid_national_id');

  const rawBirth = requireString(body.dateOfBirth, 'dateOfBirth', 10, 16);
  const dateOfBirth = normalizeIsoDate(rawBirth);
  if (!dateOfBirth) throw new HttpError(400, 'invalid_date_of_birth');
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const today = new Date();
  if (birth.getTime() >= today.getTime() || birth.getUTCFullYear() < 1900) {
    throw new HttpError(400, 'invalid_date_of_birth');
  }

  const rawIban = requireString(body.bankIban, 'bankIban', 24, 40);
  const bankIban = normalizeIranIban(rawIban);
  if (!isValidIranIban(bankIban)) throw new HttpError(400, 'invalid_bank_iban');
  const bankAccountHolder = body.bankAccountHolder === undefined || body.bankAccountHolder === null || body.bankAccountHolder === ''
    ? legalName
    : normalizeLegalName(body.bankAccountHolder, 'bankAccountHolder');

  const nationalIdHash = kycLookupHash('national_id', nationalId);
  const bankIbanHash = kycLookupHash('bank_iban', bankIban);

  try {
    const result = await withTransaction(async (client) => {
      const application = await client.query<{ id: string; status: string }>(`
        SELECT la.id::text, la.status::text
        FROM app.listener_applications la
        JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
        WHERE la.user_id=$1
        FOR UPDATE OF la
      `, [userId]);
      const appRow = application.rows[0];
      if (!appRow) throw new HttpError(404, 'listener_application_not_found');
      if (!['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(appRow.status)) {
        throw new HttpError(409, 'kyc_not_available');
      }

      const duplicate = await client.query<{ user_id: string }>(`
        SELECT user_id::text
        FROM private_data.listener_kyc
        WHERE national_id_hash=$1 AND user_id<>$2
        LIMIT 1
      `, [nationalIdHash, userId]);
      if (duplicate.rowCount) throw new HttpError(409, 'national_id_already_registered');

      const current = await client.query<{ status: string }>(`
        SELECT status::text
        FROM private_data.listener_kyc
        WHERE user_id=$1
        FOR UPDATE
      `, [userId]);
      if (current.rows[0]?.status === 'verified') throw new HttpError(409, 'kyc_already_verified');

      const legalNameCiphertext = encryptPrivateText(legalName, `listener_kyc:legal_name:${userId}`);
      const nationalIdCiphertext = encryptPrivateText(nationalId, `listener_kyc:national_id:${userId}`);
      const bankIbanCiphertext = encryptPrivateText(bankIban, `listener_kyc:bank_iban:${userId}`);
      const bankAccountHolderCiphertext = encryptPrivateText(bankAccountHolder, `listener_kyc:bank_holder:${userId}`);

      await client.query(`
        INSERT INTO private_data.listener_kyc(
          user_id, status, legal_name_ciphertext,
          national_id_ciphertext, national_id_hash, date_of_birth,
          bank_iban_ciphertext, bank_iban_hash, bank_account_holder_ciphertext,
          verified_at, rejected_reason_code
        )
        VALUES ($1,'pending',$2,$3,$4,$5,$6,$7,$8,NULL,NULL)
        ON CONFLICT (user_id) DO UPDATE SET
          status='pending',
          legal_name_ciphertext=EXCLUDED.legal_name_ciphertext,
          national_id_ciphertext=EXCLUDED.national_id_ciphertext,
          national_id_hash=EXCLUDED.national_id_hash,
          date_of_birth=EXCLUDED.date_of_birth,
          bank_iban_ciphertext=EXCLUDED.bank_iban_ciphertext,
          bank_iban_hash=EXCLUDED.bank_iban_hash,
          bank_account_holder_ciphertext=EXCLUDED.bank_account_holder_ciphertext,
          verified_at=NULL,
          rejected_reason_code=NULL
      `, [
        userId,
        legalNameCiphertext,
        nationalIdCiphertext,
        nationalIdHash,
        dateOfBirth,
        bankIbanCiphertext,
        bankIbanHash,
        bankAccountHolderCiphertext,
      ]);

      await client.query(`
        UPDATE app.listener_applications
        SET status='kyc_pending', updated_at=now()
        WHERE id=$1
      `, [appRow.id]);

      await client.query(`
        INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1,'listener_kyc_submitted','listener_application',$2,
                jsonb_build_object('status','pending','country','IR'))
      `, [userId, appRow.id]);

      return { applicationId: appRow.id };
    });

    sendJson(res, 202, { ok: true, status: 'pending', applicationId: result.applicationId });
  } catch (error) {
    const sqlError = error as { code?: string; constraint?: string };
    if (sqlError?.code === '23505') throw new HttpError(409, 'kyc_identity_conflict');
    throw error;
  }
}

export async function getListenerKycStatus(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await query<{
    application_status: string;
    kyc_status: string | null;
    verified_at: string | null;
    rejected_reason_code: string | null;
    updated_at: string | null;
  }>(`
    SELECT la.status::text application_status,
           k.status::text kyc_status,
           k.verified_at::text,
           k.rejected_reason_code,
           k.updated_at::text
    FROM app.listener_applications la
    JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
    LEFT JOIN private_data.listener_kyc k ON k.user_id=la.user_id
    WHERE la.user_id=$1
  `, [userId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'listener_application_not_found');
  sendJson(res, 200, {
    applicationStatus: row.application_status,
    status: row.kyc_status ?? 'not_started',
    verifiedAt: row.verified_at,
    rejectedReasonCode: row.rejected_reason_code,
    updatedAt: row.updated_at,
  });
}
