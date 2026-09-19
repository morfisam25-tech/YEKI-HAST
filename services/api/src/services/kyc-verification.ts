import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { normalizeIranIban, normalizeIranNationalId } from '../domain/iran-identifiers.ts';
import { allRequiredKycChecksVerified, REQUIRED_KYC_CHECKS, type KycCheckKind, type KycCheckStatus } from '../domain/kyc-verification.ts';
import { gregorianIsoToJalali } from '../domain/persian-calendar.ts';
import { decryptPrivateText } from '../lib/security.ts';
import type { SqlClient } from '../lib/sql-client.ts';
import { getKycInquiryProvider, KycInquiryProviderError } from '../providers/kyc-inquiry.ts';

interface ListenerKycRow {
  user_id: string;
  status: string;
  national_id_ciphertext: string;
  date_of_birth: string;
  bank_iban_ciphertext: string;
}

interface CheckResult {
  kind: KycCheckKind;
  status: KycCheckStatus;
  providerReference: string | null;
  failureCode: string | null;
}

async function upsertCheck(
  client: SqlClient,
  userId: string,
  kind: KycCheckKind,
  status: KycCheckStatus,
  extra: { provider?: string; providerReference?: string | null; failureCode?: string | null; requestedAt?: boolean; resolvedAt?: boolean } = {},
): Promise<void> {
  await client.query(`
    INSERT INTO private_data.listener_kyc_checks(
      user_id, check_kind, status, provider, provider_reference, failure_code, requested_at, resolved_at
    )
    VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::boolean THEN now() ELSE NULL END, CASE WHEN $8::boolean THEN now() ELSE NULL END)
    ON CONFLICT (user_id, check_kind) DO UPDATE SET
      status=EXCLUDED.status,
      provider=COALESCE(EXCLUDED.provider, private_data.listener_kyc_checks.provider),
      provider_reference=EXCLUDED.provider_reference,
      failure_code=EXCLUDED.failure_code,
      requested_at=COALESCE(private_data.listener_kyc_checks.requested_at, EXCLUDED.requested_at),
      resolved_at=COALESCE(EXCLUDED.resolved_at, private_data.listener_kyc_checks.resolved_at),
      updated_at=now()
  `, [userId, kind, status, extra.provider ?? null, extra.providerReference ?? null, extra.failureCode ?? null,
    Boolean(extra.requestedAt), Boolean(extra.resolvedAt)]);
}

// Provider-neutral: everything here works against the KycInquiryProvider
// interface (providers/kyc-inquiry.ts), never a concrete NextPay type. A
// Vandar-backed provider can be swapped in via KYC_INQUIRY_PROVIDER without
// this file changing.
//
// Deliberately synchronous with the caller (no queue/worker infrastructure
// exists anywhere in this codebase to hand this off to) -- matches the
// existing style of recording confirmation and payment verification, which
// are also synchronous provider round-trips inside a request.
export async function executeListenerKycVerification(userId: string): Promise<{ status: string }> {
  const existing = await query<ListenerKycRow>(`
    SELECT user_id::text, status::text, national_id_ciphertext,
           date_of_birth::text, bank_iban_ciphertext
    FROM private_data.listener_kyc
    WHERE user_id=$1
  `, [userId]);
  const kyc = existing.rows[0];
  if (!kyc || kyc.status !== 'pending') return { status: kyc?.status ?? 'not_started' };

  let provider;
  try {
    provider = getKycInquiryProvider();
  } catch {
    // Provider not configured: record every required check as an explicit,
    // auditable 'error' -- never silently 'verified', never silently skipped.
    await withTransaction(async (client) => {
      for (const kind of REQUIRED_KYC_CHECKS) {
        await upsertCheck(client, userId, kind, 'error', { failureCode: 'kyc_provider_not_configured', requestedAt: true, resolvedAt: true });
      }
    });
    return { status: 'pending' };
  }

  const nationalId = normalizeIranNationalId(decryptPrivateText(kyc.national_id_ciphertext, `listener_kyc:national_id:${userId}`));
  const bankIban = normalizeIranIban(decryptPrivateText(kyc.bank_iban_ciphertext, `listener_kyc:bank_iban:${userId}`));
  const jalaliBirth = gregorianIsoToJalali(kyc.date_of_birth);
  const pad2 = (value: number) => String(value).padStart(2, '0');

  await withTransaction(async (client) => {
    for (const kind of REQUIRED_KYC_CHECKS) await upsertCheck(client, userId, kind, 'pending', { provider: provider.key, requestedAt: true });
  });

  const results: CheckResult[] = [];

  try {
    const sabtAhval = await provider.sabtAhval({
      nationalId,
      birthYear: String(jalaliBirth.year),
      birthMonth: pad2(jalaliBirth.month),
      birthDay: pad2(jalaliBirth.day),
    });
    // The provider itself declares the identity match; nothing here infers a
    // match from names, only reads the field the provider already returns.
    const matched = sabtAhval.data.match === true && sabtAhval.data.is_alive !== 0;
    results.push({
      kind: 'national_id_dob_match',
      status: matched ? 'verified' : 'failed',
      providerReference: String(sabtAhval.data.inq_id),
      failureCode: matched ? null : 'kyc_national_id_dob_mismatch',
    });
  } catch (error) {
    // Any thrown error here (unreachable, malformed, or the provider
    // rejecting the query itself) is a "we don't know", never a substantive
    // negative determination -- only a clean response with match=false
    // above is a real 'failed'.
    const code = error instanceof KycInquiryProviderError ? error.code : 'kyc_inquiry_unavailable';
    results.push({ kind: 'national_id_dob_match', status: 'error', providerReference: null, failureCode: code });
  }

  try {
    // providers/kyc-inquiry.ts#sheba does not decode a typed response body --
    // no officially documented field name for an IBAN/national-id or
    // IBAN/registered-name correlation exists in this codebase. A
    // non-throwing response is the only fact this check can honestly assert:
    // the IBAN inquiry itself was accepted and returned data, not a specific
    // name-match claim. It is never labeled a "match".
    await provider.sheba({ sheba: bankIban });
    results.push({ kind: 'iban_inquiry', status: 'verified', providerReference: null, failureCode: null });
  } catch (error) {
    const code = error instanceof KycInquiryProviderError ? error.code : 'kyc_inquiry_unavailable';
    results.push({ kind: 'iban_inquiry', status: 'error', providerReference: null, failureCode: code });
  }

  return withTransaction(async (client) => {
    for (const result of results) {
      await upsertCheck(client, userId, result.kind, result.status, {
        provider: provider.key,
        providerReference: result.providerReference,
        failureCode: result.failureCode,
        resolvedAt: true,
      });
    }

    const locked = await client.query<{ status: string }>(`
      SELECT status::text FROM private_data.listener_kyc WHERE user_id=$1 FOR UPDATE
    `, [userId]);
    const currentStatus = locked.rows[0]?.status ?? 'not_started';
    if (currentStatus !== 'pending') return { status: currentStatus };

    const checksForDomain = results.map((result) => ({ checkKind: result.kind, status: result.status }));
    const allVerified = allRequiredKycChecksVerified(checksForDomain);

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, $2, 'listener_kyc', $1, jsonb_build_object('provider', $3, 'checks', $4::jsonb))
    `, [
      userId,
      allVerified ? 'listener_kyc_field_checks_verified' : 'listener_kyc_field_checks_incomplete',
      provider.key,
      JSON.stringify(checksForDomain),
    ]);

    if (!allVerified) return { status: 'pending' };

    await client.query(`
      UPDATE private_data.listener_kyc
      SET status='verified', verified_at=now()
      WHERE user_id=$1 AND status='pending'
    `, [userId]);
    return { status: 'verified' };
  });
}
