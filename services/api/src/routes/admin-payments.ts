import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const allowedStatuses = new Set(['pending', 'succeeded', 'failed', 'cancelled']);

function readLimit(url: URL): number {
  const raw = url.searchParams.get('limit') ?? '50';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new HttpError(400, 'invalid_limit');
  return value;
}

function readStatus(url: URL): string | null {
  const raw = url.searchParams.get('status')?.trim() || null;
  if (raw !== null && !allowedStatuses.has(raw)) throw new HttpError(400, 'invalid_status');
  return raw;
}

export async function listAdminPaymentAttempts(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = readLimit(url);
  const status = readStatus(url);

  const result = await query<{
    id: string;
    user_id: string;
    provider: string;
    currency_code: string;
    amount_minor: string;
    provider_fee_minor: string;
    status: string;
    provider_payment_id: string | null;
    created_at: string;
    completed_at: string | null;
  }>(`
    SELECT id::text, user_id::text, provider, currency_code,
           amount_minor::text, provider_fee_minor::text, status::text,
           provider_payment_id, created_at::text, completed_at::text
    FROM app.payment_attempts
    WHERE ($1::text IS NULL OR status::text=$1)
    ORDER BY created_at DESC
    LIMIT $2
  `, [status, limit]);

  sendJson(res, 200, {
    ok: true,
    filters: { status, limit },
    attempts: result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      currencyCode: row.currency_code,
      amountMinor: row.amount_minor,
      providerFeeMinor: row.provider_fee_minor,
      status: row.status,
      providerPaymentReference: row.provider_payment_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      phoneNumberIncluded: false,
      walletDetailsIncluded: false,
      idempotencyKeyIncluded: false,
    })),
  });
}
