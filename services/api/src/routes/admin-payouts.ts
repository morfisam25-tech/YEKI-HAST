import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const ALLOWED_STATUSES = new Set(['created', 'processing', 'failed', 'paid']);

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

  const result = await query<{
    id: string;
    listener_user_id: string;
    amount_minor: string;
    currency_code: string;
    status: string;
    provider: string | null;
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
  `, [status, limit]);

  sendJson(res, 200, {
    payouts: result.rows.map((row) => ({
      id: row.id,
      listenerUserId: row.listener_user_id,
      amountMinor: row.amount_minor,
      currencyCode: row.currency_code,
      status: row.status,
      provider: row.provider,
      sourceCount: Number(row.source_count),
      kycStatus: row.kyc_status ?? 'not_started',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paidAt: row.paid_at,
    })),
  });
}
