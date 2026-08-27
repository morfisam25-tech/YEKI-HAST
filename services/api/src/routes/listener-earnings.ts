import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { sendJson } from '../lib/http.ts';

const DISPLAY_LIMIT = 20;

export async function getListenerEarnings(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);

  const [summary, recent] = await Promise.all([
    query<{
      currency_code: string;
      status: string;
      amount_minor: string;
      earning_count: string;
    }>(`
      SELECT currency_code,
             status::text,
             COALESCE(SUM(amount_minor),0)::text AS amount_minor,
             COUNT(*)::text AS earning_count
      FROM app.listener_earnings
      WHERE listener_user_id=$1
      GROUP BY currency_code, status
      ORDER BY currency_code, status
    `, [userId]),
    query<{
      id: string;
      currency_code: string;
      amount_minor: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT id::text,
             currency_code,
             amount_minor::text,
             status::text,
             created_at::text,
             updated_at::text
      FROM app.listener_earnings
      WHERE listener_user_id=$1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `, [userId, DISPLAY_LIMIT]),
  ]);

  sendJson(res, 200, {
    summary: summary.rows.map((row) => ({
      currencyCode: row.currency_code,
      status: row.status,
      amountMinor: row.amount_minor,
      earningCount: Number(row.earning_count),
    })),
    recent: recent.rows.map((row) => ({
      earningId: row.id,
      currencyCode: row.currency_code,
      amountMinor: row.amount_minor,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    policyMutationIncluded: false,
    payoutActionIncluded: false,
  });
}
