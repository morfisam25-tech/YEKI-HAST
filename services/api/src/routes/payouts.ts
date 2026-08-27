import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { decryptPrivateText } from '../lib/security.ts';
import { HttpError, sendJson } from '../lib/http.ts';
import { getPayoutProvider, PayoutProviderError } from '../providers/payout.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PayoutRow = {
  id: string;
  listener_user_id: string;
  market_id: string;
  currency_code: string;
  amount_minor: string;
  status: string;
  provider: string | null;
  provider_reference: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

function payoutIdFrom(value: string): string {
  const id = value.trim();
  if (!UUID_RE.test(id)) throw new HttpError(400, 'invalid_payout');
  return id;
}

function providerOr503() {
  try { return getPayoutProvider(); }
  catch (error) {
    if (error instanceof PayoutProviderError) throw new HttpError(503, 'payout_provider_not_configured');
    throw error;
  }
}

export async function dispatchPayout(req: IncomingMessage, res: ServerResponse, rawPayoutId: string) {
  const admin = await requireAdmin(req);
  const payoutId = payoutIdFrom(rawPayoutId);
  const provider = providerOr503();

  const prepared = await withTransaction(async (client) => {
    const payout = await client.query<PayoutRow>(`
      SELECT id::text, listener_user_id::text, market_id::text, currency_code,
             amount_minor::text, status::text, provider, provider_reference,
             created_at::text, updated_at::text, paid_at::text
      FROM app.payouts
      WHERE id=$1
      FOR UPDATE
    `, [payoutId]);
    const row = payout.rows[0];
    if (!row) throw new HttpError(404, 'payout_not_found');
    if (row.status !== 'created') throw new HttpError(409, 'payout_not_dispatchable');
    if (row.currency_code !== 'IRR') throw new HttpError(409, 'payout_currency_not_supported');
    if (row.provider || row.provider_reference) throw new HttpError(409, 'payout_provider_already_set');

    const kyc = await client.query<{
      status: string;
      bank_iban_ciphertext: string | null;
      bank_account_holder_ciphertext: string | null;
    }>(`
      SELECT status::text, bank_iban_ciphertext, bank_account_holder_ciphertext
      FROM private_data.listener_kyc
      WHERE user_id=$1
      FOR UPDATE
    `, [row.listener_user_id]);
    const kycRow = kyc.rows[0];
    if (!kycRow || kycRow.status !== 'verified') throw new HttpError(409, 'listener_kyc_not_verified');
    if (!kycRow.bank_iban_ciphertext || !kycRow.bank_account_holder_ciphertext) {
      throw new HttpError(409, 'listener_payout_details_missing');
    }

    const itemTotal = await client.query<{ total: string; count: string }>(`
      SELECT COALESCE(SUM(amount_minor),0)::text total, COUNT(*)::text count
      FROM app.payout_items
      WHERE payout_id=$1
    `, [row.id]);
    if (Number(itemTotal.rows[0]?.count ?? 0) < 1) throw new HttpError(409, 'payout_has_no_items');
    if (BigInt(itemTotal.rows[0].total) !== BigInt(row.amount_minor)) throw new HttpError(409, 'payout_amount_mismatch');

    const wrongMarket = await client.query<{ id: string }>(`
      SELECT pi.id::text
      FROM app.payout_items pi
      JOIN app.listener_earnings e ON e.id=pi.earning_id
      WHERE pi.payout_id=$1
        AND e.market_id<>$2
      LIMIT 1
    `, [row.id, row.market_id]);
    if (wrongMarket.rowCount) throw new HttpError(409, 'payout_source_market_mismatch');

    const unavailable = await client.query<{ id: string }>(`
      SELECT pi.id::text
      FROM app.payout_items pi
      LEFT JOIN app.listener_earnings e ON e.id=pi.earning_id
      LEFT JOIN app.listener_guarantee_assignments g ON g.id=pi.guarantee_assignment_id
      WHERE pi.payout_id=$1
        AND (
          (pi.earning_id IS NOT NULL AND e.status<>'available')
          OR (pi.guarantee_assignment_id IS NOT NULL AND g.status<>'eligible')
        )
      LIMIT 1
    `, [row.id]);
    if (unavailable.rowCount) throw new HttpError(409, 'payout_source_not_available');

    const iban = decryptPrivateText(
      kycRow.bank_iban_ciphertext,
      `listener_kyc:bank_iban:${row.listener_user_id}`,
    );
    const accountHolderName = decryptPrivateText(
      kycRow.bank_account_holder_ciphertext,
      `listener_kyc:bank_holder:${row.listener_user_id}`,
    );

    await client.query(`
      UPDATE app.payouts
      SET status='processing', provider=$2
      WHERE id=$1
    `, [row.id, provider.key]);
    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'payout_dispatch_started','payout',$2,
              jsonb_build_object('provider',$3,'amountMinor',$4,'currencyCode',$5))
    `, [admin.userId, row.id, provider.key, row.amount_minor, row.currency_code]);

    return {
      payoutId: row.id,
      listenerId: row.listener_user_id,
      amountMinor: BigInt(row.amount_minor),
      currencyCode: 'IRR' as const,
      iban,
      accountHolderName,
    };
  });

  try {
    const submitted = await provider.submit({
      payoutId: prepared.payoutId,
      amountMinor: prepared.amountMinor,
      currencyCode: prepared.currencyCode,
      iban: prepared.iban,
      accountHolderName: prepared.accountHolderName,
    });
    await withTransaction(async (client) => {
      const updated = await client.query(`
        UPDATE app.payouts
        SET provider_reference=$2
        WHERE id=$1 AND status='processing' AND provider=$3 AND provider_reference IS NULL
        RETURNING id
      `, [prepared.payoutId, submitted.providerReference, provider.key]);
      if (!updated.rowCount) throw new HttpError(409, 'payout_state_conflict');
      await client.query(`
        INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1,'payout_provider_accepted','payout',$2,
                jsonb_build_object('provider',$3,'providerReference',$4,'providerReportedTotal',$5))
      `, [
        admin.userId,
        prepared.payoutId,
        provider.key,
        submitted.providerReference,
        submitted.providerReportedTotal,
      ]);
    });
    sendJson(res, 202, {
      ok: true,
      payoutId: prepared.payoutId,
      status: 'processing',
      provider: provider.key,
      providerReferenceIncluded: false,
    });
  } catch (error) {
    if (error instanceof PayoutProviderError) {
      // A null providerCode can mean a network/response ambiguity after the provider
      // may already have accepted the transfer. Never retry or mark failed blindly.
      if (error.providerCode !== null) {
        await withTransaction(async (client) => {
          await client.query(`
            UPDATE app.payouts
            SET status='failed'
            WHERE id=$1 AND status='processing' AND provider_reference IS NULL
          `, [prepared.payoutId]);
          await client.query(`
            INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
            VALUES ($1,'payout_provider_rejected','payout',$2,
                    jsonb_build_object('provider',$3,'providerCode',$4))
          `, [admin.userId, prepared.payoutId, provider.key, error.providerCode]);
        });
        throw new HttpError(502, 'payout_provider_rejected');
      }
      await query(`
        INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1,'payout_dispatch_ambiguous','payout',$2,
                jsonb_build_object('provider',$3,'reason',$4))
      `, [admin.userId, prepared.payoutId, provider.key, error.code]).catch(() => undefined);
      throw new HttpError(502, 'payout_dispatch_ambiguous');
    }
    throw error;
  }
}

export async function reconcilePayout(req: IncomingMessage, res: ServerResponse, rawPayoutId: string) {
  const admin = await requireAdmin(req);
  const payoutId = payoutIdFrom(rawPayoutId);
  const provider = providerOr503();

  const payout = await query<PayoutRow>(`
    SELECT id::text, listener_user_id::text, market_id::text, currency_code,
           amount_minor::text, status::text, provider, provider_reference,
           created_at::text, updated_at::text, paid_at::text
    FROM app.payouts
    WHERE id=$1
  `, [payoutId]);
  const row = payout.rows[0];
  if (!row) throw new HttpError(404, 'payout_not_found');
  if (row.provider !== provider.key) throw new HttpError(409, 'payout_provider_mismatch');
  if (row.status === 'paid') {
    sendJson(res, 200, {
      ok: true,
      payoutId: row.id,
      status: 'paid',
      idempotent: true,
      providerReferenceIncluded: false,
    });
    return;
  }
  if (!['processing', 'failed'].includes(row.status)) throw new HttpError(409, 'payout_not_reconcilable');

  let status;
  try { status = await provider.getStatus(row.id); }
  catch (error) {
    if (error instanceof PayoutProviderError) {
      console.error('payout_reconciliation_failed', { payoutId: row.id, providerCode: error.providerCode });
      throw new HttpError(502, 'payout_reconciliation_unavailable');
    }
    throw error;
  }

  if (!status.completed) {
    await query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'payout_reconciled_pending','payout',$2,
              jsonb_build_object('provider',$3,'providerStatus',$4,'bankTrackingNumber',$5))
    `, [admin.userId, row.id, provider.key, status.providerStatus, status.bankTrackingNumber]);
    sendJson(res, 200, {
      ok: true,
      payoutId: row.id,
      status: row.status,
      providerStatus: status.providerStatus,
      providerReferenceIncluded: false,
    });
    return;
  }

  await withTransaction(async (client) => {
    const locked = await client.query<PayoutRow>(`
      SELECT id::text, listener_user_id::text, market_id::text, currency_code,
             amount_minor::text, status::text, provider, provider_reference,
             created_at::text, updated_at::text, paid_at::text
      FROM app.payouts
      WHERE id=$1
      FOR UPDATE
    `, [row.id]);
    const current = locked.rows[0];
    if (!current) throw new HttpError(404, 'payout_not_found');
    if (current.status === 'paid') return;
    if (!['processing', 'failed'].includes(current.status)) throw new HttpError(409, 'payout_state_conflict');

    const itemTotal = await client.query<{ total: string }>(`
      SELECT COALESCE(SUM(amount_minor),0)::text total
      FROM app.payout_items
      WHERE payout_id=$1
    `, [current.id]);
    if (BigInt(itemTotal.rows[0]?.total ?? '0') !== BigInt(current.amount_minor)) {
      throw new HttpError(409, 'payout_amount_mismatch');
    }

    await client.query(`
      UPDATE app.listener_earnings e
      SET status='paid', updated_at=now()
      FROM app.payout_items pi
      WHERE pi.payout_id=$1 AND pi.earning_id=e.id AND e.status='available'
    `, [current.id]);
    await client.query(`
      UPDATE app.listener_guarantee_assignments g
      SET status='settled', settled_at=COALESCE(settled_at, now())
      FROM app.payout_items pi
      WHERE pi.payout_id=$1 AND pi.guarantee_assignment_id=g.id AND g.status='eligible'
    `, [current.id]);
    await client.query(`
      UPDATE app.payouts
      SET status='paid', paid_at=COALESCE(paid_at, now()),
          provider_reference=COALESCE(provider_reference,$2)
      WHERE id=$1
    `, [current.id, status.bankTrackingNumber]);
    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'payout_paid_reconciled','payout',$2,
              jsonb_build_object('provider',$3,'providerStatus',$4,'bankTrackingNumber',$5,
                                 'amountMinor',$6,'currencyCode',$7))
    `, [
      admin.userId,
      current.id,
      provider.key,
      status.providerStatus,
      status.bankTrackingNumber,
      current.amount_minor,
      current.currency_code,
    ]);
  });

  sendJson(res, 200, {
    ok: true,
    payoutId: row.id,
    status: 'paid',
    providerStatus: status.providerStatus,
    providerReferenceIncluded: false,
  });
}
