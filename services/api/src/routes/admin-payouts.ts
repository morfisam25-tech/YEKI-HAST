import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const ALLOWED_STATUSES = new Set(['created', 'processing', 'failed', 'paid']);
const AMBIGUOUS_DISPATCH_MINUTES = 5;

function limitFrom(value: string | null): number {
  if (!value) return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new HttpError(400, 'invalid_limit');
  return parsed;
}

export async function listAdminPayouts(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const status = url.searchParams.get('status')?.trim() || null;
  if (status && !ALLOWED_STATUSES.has(status)) throw new HttpError(400, 'invalid_payout_status');
  const limit = limitFrom(url.searchParams.get('limit'));

  const [result, candidates, pendingBacklog] = await Promise.all([
    query<{
      id: string;
      listener_user_id: string;
      amount_minor: string;
      currency_code: string;
      status: string;
      provider: string | null;
      dispatch_needs_reconciliation: boolean;
      created_at: string;
      updated_at: string;
      paid_at: string | null;
      source_count: string;
      kyc_status: string | null;
    }>(`
      SELECT p.id::text,
             p.listener_user_id::text,
             p.amount_minor::text,
             p.currency_code,
             p.status::text,
             p.provider,
             (
               p.status::text='processing'
               AND p.provider IS NOT NULL
               AND p.provider_reference IS NULL
               AND p.updated_at < now() - ($3::int * interval '1 minute')
             ) AS dispatch_needs_reconciliation,
             p.created_at::text,
             p.updated_at::text,
             p.paid_at::text,
             COUNT(pi.id)::text AS source_count,
             k.status::text AS kyc_status
      FROM app.payouts p
      LEFT JOIN app.payout_items pi ON pi.payout_id=p.id
      LEFT JOIN private_data.listener_kyc k ON k.user_id=p.listener_user_id
      WHERE ($1::text IS NULL OR p.status::text=$1)
      GROUP BY p.id, k.status
      ORDER BY
        CASE p.status::text
          WHEN 'created' THEN 0
          WHEN 'processing' THEN 1
          WHEN 'failed' THEN 2
          ELSE 3
        END,
        p.created_at ASC
      LIMIT $2
    `, [status, limit, AMBIGUOUS_DISPATCH_MINUTES]),
    query<{
      listener_user_id: string;
      market_id: string;
      currency_code: string;
      available_minor: string;
      earning_count: string;
      oldest_available_at: string;
      kyc_status: string | null;
    }>(`
      SELECT e.listener_user_id::text,
             e.market_id::text,
             e.currency_code,
             COALESCE(SUM(e.amount_minor),0)::text AS available_minor,
             COUNT(*)::text AS earning_count,
             MIN(e.created_at)::text AS oldest_available_at,
             k.status::text AS kyc_status
      FROM app.listener_earnings e
      LEFT JOIN app.payout_items pi ON pi.earning_id=e.id
      LEFT JOIN private_data.listener_kyc k ON k.user_id=e.listener_user_id
      WHERE e.status='available' AND pi.id IS NULL
      GROUP BY e.listener_user_id, e.market_id, e.currency_code, k.status
      ORDER BY MIN(e.created_at) ASC
      LIMIT 100
    `),
    query<{
      currency_code: string;
      pending_minor: string;
      earning_count: string;
      listener_count: string;
      oldest_pending_at: string | null;
    }>(`
      SELECT e.currency_code,
             COALESCE(SUM(e.amount_minor),0)::text AS pending_minor,
             COUNT(*)::text AS earning_count,
             COUNT(DISTINCT e.listener_user_id)::text AS listener_count,
             MIN(e.created_at)::text AS oldest_pending_at
      FROM app.listener_earnings e
      WHERE e.status='pending'
      GROUP BY e.currency_code
      ORDER BY e.currency_code
    `),
  ]);

  sendJson(res, 200, {
    thresholds: { ambiguousDispatchMinutes: AMBIGUOUS_DISPATCH_MINUTES },
    payouts: result.rows.map((row) => ({
      id: row.id,
      listenerUserId: row.listener_user_id,
      amountMinor: row.amount_minor,
      currencyCode: row.currency_code,
      status: row.status,
      provider: row.provider,
      dispatchNeedsReconciliation: row.dispatch_needs_reconciliation,
      sourceCount: Number(row.source_count),
      kycStatus: row.kyc_status ?? 'not_started',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paidAt: row.paid_at,
    })),
    payoutCandidates: candidates.rows.map((row) => ({
      listenerUserId: row.listener_user_id,
      marketId: row.market_id,
      currencyCode: row.currency_code,
      availableMinor: row.available_minor,
      earningCount: Number(row.earning_count),
      oldestAvailableAt: row.oldest_available_at,
      kycStatus: row.kyc_status ?? 'not_started',
    })),
    pendingEarningBacklog: pendingBacklog.rows.map((row) => ({
      currencyCode: row.currency_code,
      pendingMinor: row.pending_minor,
      earningCount: Number(row.earning_count),
      listenerCount: Number(row.listener_count),
      oldestPendingAt: row.oldest_pending_at,
    })),
    providerReferencesIncluded: false,
    bankDetailsIncluded: false,
  });
}
