import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { applyInternalBetaAdminCredit } from '../services/admin-wallet-credit.ts';

const allowedStatuses = new Set(['pending', 'succeeded', 'failed', 'cancelled']);
const INITIALIZATION_AMBIGUOUS_MINUTES = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

export function readPositiveAdminCreditAmount(value: unknown): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) throw new HttpError(400, 'invalid_amount');
    return BigInt(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const amount = BigInt(value.trim());
    if (amount > 0n && amount <= MAX_BIGINT) return amount;
  }
  throw new HttpError(400, 'invalid_amount');
}

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
    initialization_ambiguous: boolean;
  }>(`
    SELECT id::text, user_id::text, provider, currency_code,
           amount_minor::text, provider_fee_minor::text, status::text,
           provider_payment_id, created_at::text, completed_at::text,
           (
             status::text='pending'
             AND provider_payment_id IS NULL
             AND created_at < now() - ($3::int * interval '1 minute')
           ) AS initialization_ambiguous
    FROM app.payment_attempts
    WHERE ($1::text IS NULL OR status::text=$1)
    ORDER BY created_at DESC
    LIMIT $2
  `, [status, limit, INITIALIZATION_AMBIGUOUS_MINUTES]);

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
      providerReferencePresent: Boolean(row.provider_payment_id),
      initializationAmbiguous: row.initialization_ambiguous,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      phoneNumberIncluded: false,
      walletDetailsIncluded: false,
      idempotencyKeyIncluded: false,
      providerReferenceIncluded: false,
    })),
  });
}

type AdminCreditDependencies = {
  authenticate: typeof requireAdmin;
  transact: typeof withTransaction;
};

export async function createAdminWalletCreditWithDependencies(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: AdminCreditDependencies,
) {
  // Authorization deliberately precedes body parsing and every database mutation.
  const admin = await dependencies.authenticate(req);
  const body = await readJson<{
    targetUserId?: unknown;
    amountMinor?: unknown;
    currencyCode?: unknown;
    reason?: unknown;
    idempotencyKey?: unknown;
  }>(req);

  const targetUserId = requireString(body.targetUserId, 'targetUserId', 36, 36).toLowerCase();
  if (!UUID_RE.test(targetUserId)) throw new HttpError(400, 'invalid_target_user');
  const amountMinor = readPositiveAdminCreditAmount(body.amountMinor);
  const currencyCode = requireString(body.currencyCode, 'currencyCode', 3, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new HttpError(400, 'invalid_currency');
  const reason = requireString(body.reason, 'reason', 3, 500);
  const idempotencyKey = requireString(body.idempotencyKey, 'idempotencyKey', 8, 100);

  const result = await dependencies.transact((client) => applyInternalBetaAdminCredit(client, {
    adminUserId: admin.userId,
    adminRole: admin.adminRole,
    targetUserId,
    amountMinor,
    currencyCode,
    reason,
    idempotencyKey,
  }));

  sendJson(res, result.idempotent ? 200 : 201, { ok: true, ...result });
}

export async function createAdminWalletCredit(req: IncomingMessage, res: ServerResponse) {
  return createAdminWalletCreditWithDependencies(req, res, {
    authenticate: requireAdmin,
    transact: withTransaction,
  });
}
