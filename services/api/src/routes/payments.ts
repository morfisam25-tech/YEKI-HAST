import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { nextPayVerificationDisposition } from '../domain/payment-status.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { getPaymentProvider, PaymentProviderError } from '../providers/payment.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

type AttemptRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  market_id: string;
  provider: string;
  currency_code: string;
  amount_minor: string;
  status: string;
  provider_payment_id: string | null;
  provider_fee_minor: string;
  created_at: string;
  completed_at: string | null;
};

function parseAmountMinor(value: unknown): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) throw new HttpError(400, 'invalid_amount');
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) throw new HttpError(400, 'invalid_amount');
    const amount = BigInt(normalized);
    if (amount <= 0n || amount > MAX_BIGINT) throw new HttpError(400, 'invalid_amount');
    return amount;
  }
  throw new HttpError(400, 'invalid_amount');
}

function paymentCallbackUri(): string {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://yeki-hast.vercel.app'
    : 'http://localhost:4000';
  const raw = process.env.PAYMENT_CALLBACK_BASE_URL?.trim() || fallback;
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new HttpError(503, 'payment_not_configured'); }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new HttpError(503, 'payment_not_configured');
  }
  url.pathname = '/v1/payments/nextpay/callback';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function paymentUrl(providerPaymentId: string): string {
  return `https://nextpay.org/nx/gateway/payment/${encodeURIComponent(providerPaymentId)}`;
}

function publicAttempt(row: AttemptRow) {
  return {
    attemptId: row.id,
    provider: row.provider,
    status: row.status,
    currencyCode: row.currency_code,
    amountMinor: row.amount_minor,
    providerPaymentId: row.provider_payment_id,
    paymentUrl: row.status === 'pending' && row.provider_payment_id ? paymentUrl(row.provider_payment_id) : null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function limitFrom(value: string | null): number {
  const parsed = value ? Number(value) : 50;
  if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(400, 'invalid_limit');
  return Math.min(parsed, 100);
}

export async function getWallet(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await query<{
    currency_code: string;
    balance_minor: string;
    reserved_minor: string;
    version: string;
  }>(`
    SELECT currency_code, balance_minor::text, reserved_minor::text, version::text
    FROM app.wallets
    WHERE user_id=$1
    ORDER BY currency_code
  `, [userId]);
  sendJson(res, 200, {
    wallets: result.rows.map((row) => ({
      currencyCode: row.currency_code,
      balanceMinor: row.balance_minor,
      reservedMinor: row.reserved_minor,
      availableMinor: (BigInt(row.balance_minor) - BigInt(row.reserved_minor)).toString(),
      version: row.version,
    })),
  });
}

export async function getWalletTransactions(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rawCurrency = url.searchParams.get('currency')?.trim().toUpperCase() ?? null;
  if (rawCurrency !== null && !/^[A-Z]{3}$/.test(rawCurrency)) throw new HttpError(400, 'invalid_currency');
  const limit = limitFrom(url.searchParams.get('limit'));

  const result = await query<{
    id: string;
    currency_code: string;
    type: string;
    delta_minor: string;
    balance_after_minor: string;
    call_session_id: string | null;
    payment_attempt_id: string | null;
    reason_code: string | null;
    created_at: string;
  }>(`
    SELECT wt.id::text, wt.currency_code, wt.type::text,
           wt.delta_minor::text, wt.balance_after_minor::text,
           wt.call_session_id::text, wt.payment_attempt_id::text,
           wt.reason_code, wt.created_at::text
    FROM app.wallet_transactions wt
    JOIN app.wallets w ON w.id=wt.wallet_id AND w.currency_code=wt.currency_code
    WHERE w.user_id=$1
      AND ($2::text IS NULL OR wt.currency_code=$2)
    ORDER BY wt.created_at DESC, wt.id DESC
    LIMIT $3
  `, [userId, rawCurrency, limit]);

  sendJson(res, 200, {
    transactions: result.rows.map((row) => ({
      id: row.id,
      currencyCode: row.currency_code,
      type: row.type,
      deltaMinor: row.delta_minor,
      balanceAfterMinor: row.balance_after_minor,
      callId: row.call_session_id,
      paymentAttemptId: row.payment_attempt_id,
      reasonCode: row.reason_code,
      createdAt: row.created_at,
    })),
  });
}

export async function createWalletTopup(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  let provider;
  try { provider = getPaymentProvider(); }
  catch (error) {
    if (error instanceof PaymentProviderError) throw new HttpError(503, 'payment_not_configured');
    throw error;
  }

  const body = await readJson<{ amountMinor?: unknown; idempotencyKey?: unknown }>(req);
  const amountMinor = parseAmountMinor(body.amountMinor);
  const clientKey = requireString(body.idempotencyKey, 'idempotencyKey', 8, 100);
  const idempotencyKey = `wallet-topup:${userId}:${clientKey}`;
  const callbackUri = paymentCallbackUri();

  const attempt = await withTransaction(async (client) => {
    const existing = await client.query<AttemptRow>(`
      SELECT id::text, user_id::text, wallet_id::text, market_id::text, provider,
             currency_code, amount_minor::text, status::text, provider_payment_id,
             provider_fee_minor::text, created_at::text, completed_at::text
      FROM app.payment_attempts
      WHERE idempotency_key=$1 AND user_id=$2
      FOR UPDATE
    `, [idempotencyKey, userId]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (BigInt(row.amount_minor) !== amountMinor) throw new HttpError(409, 'idempotency_amount_mismatch');
      return { row, created: false };
    }

    const market = await client.query<{ id: string; currency_code: string }>(`
      SELECT id::text, default_currency_code currency_code
      FROM app.markets
      WHERE code='ir' AND is_active=true
      LIMIT 1
    `);
    const ctx = market.rows[0];
    if (!ctx || ctx.currency_code !== 'IRR') throw new HttpError(503, 'payment_market_unavailable');

    const wallet = await client.query<{ id: string }>(`
      INSERT INTO app.wallets(user_id, currency_code)
      VALUES ($1,$2)
      ON CONFLICT (user_id, currency_code) DO UPDATE SET user_id=EXCLUDED.user_id
      RETURNING id::text
    `, [userId, ctx.currency_code]);

    const inserted = await client.query<AttemptRow>(`
      INSERT INTO app.payment_attempts(
        user_id, wallet_id, market_id, provider, currency_code,
        amount_minor, status, idempotency_key
      )
      VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
      RETURNING id::text, user_id::text, wallet_id::text, market_id::text, provider,
                currency_code, amount_minor::text, status::text, provider_payment_id,
                provider_fee_minor::text, created_at::text, completed_at::text
    `, [userId, wallet.rows[0].id, ctx.id, provider.key, ctx.currency_code, amountMinor.toString(), idempotencyKey]);
    return { row: inserted.rows[0], created: true };
  });

  if (!attempt.created) {
    if (attempt.row.status === 'pending' && !attempt.row.provider_payment_id) {
      throw new HttpError(409, 'payment_initializing');
    }
    sendJson(res, 200, { ok: true, idempotent: true, ...publicAttempt(attempt.row) });
    return;
  }

  let createdPayment;
  try {
    createdPayment = await provider.createPayment({
      orderId: attempt.row.id,
      amountMinor,
      currencyCode: 'IRR',
      callbackUri,
    });
  } catch (error) {
    await query(`
      UPDATE app.payment_attempts
      SET status='failed', completed_at=COALESCE(completed_at, now())
      WHERE id=$1 AND status='pending' AND provider_payment_id IS NULL
    `, [attempt.row.id]).catch(() => undefined);
    if (error instanceof PaymentProviderError) {
      console.error('payment_token_failed', { attemptId: attempt.row.id, providerCode: error.providerCode });
      throw new HttpError(502, 'payment_provider_unavailable');
    }
    throw error;
  }

  const updated = await query<AttemptRow>(`
    UPDATE app.payment_attempts
    SET provider_payment_id=$2
    WHERE id=$1 AND status='pending' AND provider_payment_id IS NULL
    RETURNING id::text, user_id::text, wallet_id::text, market_id::text, provider,
              currency_code, amount_minor::text, status::text, provider_payment_id,
              provider_fee_minor::text, created_at::text, completed_at::text
  `, [attempt.row.id, createdPayment.providerPaymentId]);
  if (!updated.rows[0]) throw new HttpError(409, 'payment_state_conflict');

  sendJson(res, 201, {
    ok: true,
    idempotent: false,
    ...publicAttempt(updated.rows[0]),
    paymentUrl: createdPayment.redirectUrl,
  });
}

export async function getWalletTopup(req: IncomingMessage, res: ServerResponse, rawAttemptId: string) {
  const { userId } = await requireAuth(req);
  if (!UUID_RE.test(rawAttemptId)) throw new HttpError(400, 'invalid_payment_attempt');
  const result = await query<AttemptRow>(`
    SELECT id::text, user_id::text, wallet_id::text, market_id::text, provider,
           currency_code, amount_minor::text, status::text, provider_payment_id,
           provider_fee_minor::text, created_at::text, completed_at::text
    FROM app.payment_attempts
    WHERE id=$1 AND user_id=$2
  `, [rawAttemptId, userId]);
  if (!result.rows[0]) throw new HttpError(404, 'payment_attempt_not_found');
  sendJson(res, 200, publicAttempt(result.rows[0]));
}

export async function nextPayCallback(req: IncomingMessage, res: ServerResponse) {
  let provider;
  try { provider = getPaymentProvider(); }
  catch (error) {
    if (error instanceof PaymentProviderError) throw new HttpError(503, 'payment_not_configured');
    throw error;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const transId = url.searchParams.get('trans_id')?.trim() ?? '';
  const orderId = url.searchParams.get('order_id')?.trim() ?? '';
  if (!UUID_RE.test(transId) || !UUID_RE.test(orderId)) throw new HttpError(400, 'invalid_payment_callback');

  const initial = await query<AttemptRow>(`
    SELECT id::text, user_id::text, wallet_id::text, market_id::text, provider,
           currency_code, amount_minor::text, status::text, provider_payment_id,
           provider_fee_minor::text, created_at::text, completed_at::text
    FROM app.payment_attempts
    WHERE id=$1 AND provider='nextpay'
  `, [orderId]);
  const row = initial.rows[0];
  if (!row || row.provider_payment_id !== transId) throw new HttpError(400, 'invalid_payment_callback');
  if (row.status === 'succeeded') {
    sendJson(res, 200, { ok: true, status: 'succeeded', attemptId: row.id, idempotent: true });
    return;
  }
  if (row.status !== 'pending') {
    sendJson(res, 200, { ok: false, status: row.status, attemptId: row.id });
    return;
  }

  let verified;
  try {
    verified = await provider.verifyPayment({
      providerPaymentId: transId,
      amountMinor: BigInt(row.amount_minor),
      currencyCode: 'IRR',
    });
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      console.error('payment_verify_provider_error', { attemptId: row.id, providerCode: error.providerCode });
      throw new HttpError(502, 'payment_verification_unavailable');
    }
    throw error;
  }

  const disposition = nextPayVerificationDisposition(verified.providerCode);
  if (disposition === 'pending') {
    sendJson(res, 202, {
      ok: false,
      status: 'pending',
      attemptId: row.id,
      providerCode: verified.providerCode,
    });
    return;
  }
  if (disposition === 'cancelled' || disposition === 'failed') {
    await query(`
      UPDATE app.payment_attempts
      SET status=$2, completed_at=COALESCE(completed_at, now())
      WHERE id=$1 AND status='pending'
    `, [row.id, disposition]);
    sendJson(res, 200, {
      ok: false,
      status: disposition,
      attemptId: row.id,
      providerCode: verified.providerCode,
    });
    return;
  }

  if (!verified.paid || verified.orderId !== row.id || verified.amountMinor !== BigInt(row.amount_minor)) {
    console.error('payment_verification_mismatch', {
      attemptId: row.id,
      providerOrderId: verified.orderId,
      providerAmountMinor: verified.amountMinor?.toString() ?? null,
      providerCode: verified.providerCode,
    });
    throw new HttpError(409, 'payment_verification_mismatch');
  }

  const credited = await withTransaction(async (client) => {
    const locked = await client.query<AttemptRow>(`
      SELECT id::text, user_id::text, wallet_id::text, market_id::text, provider,
             currency_code, amount_minor::text, status::text, provider_payment_id,
             provider_fee_minor::text, created_at::text, completed_at::text
      FROM app.payment_attempts
      WHERE id=$1
      FOR UPDATE
    `, [row.id]);
    const current = locked.rows[0];
    if (!current) throw new HttpError(404, 'payment_attempt_not_found');
    if (current.status === 'succeeded') {
      const wallet = await client.query<{ balance_minor: string }>(
        'SELECT balance_minor::text FROM app.wallets WHERE id=$1', [current.wallet_id],
      );
      return { balanceMinor: wallet.rows[0]?.balance_minor ?? null, idempotent: true };
    }
    if (current.status !== 'pending') throw new HttpError(409, 'payment_state_conflict');

    const wallet = await client.query<{ balance_minor: string }>(`
      SELECT balance_minor::text
      FROM app.wallets
      WHERE id=$1 AND currency_code=$2
      FOR UPDATE
    `, [current.wallet_id, current.currency_code]);
    if (!wallet.rows[0]) throw new HttpError(503, 'wallet_unavailable');

    const existingTx = await client.query<{ balance_after_minor: string }>(`
      SELECT balance_after_minor::text
      FROM app.wallet_transactions
      WHERE payment_attempt_id=$1 AND type='payment_topup'
      LIMIT 1
    `, [current.id]);
    if (existingTx.rows[0]) {
      await client.query(`
        UPDATE app.payment_attempts
        SET status='succeeded', completed_at=COALESCE(completed_at, now())
        WHERE id=$1
      `, [current.id]);
      return { balanceMinor: existingTx.rows[0].balance_after_minor, idempotent: true };
    }

    const newBalance = BigInt(wallet.rows[0].balance_minor) + BigInt(current.amount_minor);
    if (newBalance > MAX_BIGINT) throw new HttpError(409, 'wallet_balance_overflow');
    await client.query(`
      UPDATE app.wallets
      SET balance_minor=$2::bigint, version=version+1
      WHERE id=$1
    `, [current.wallet_id, newBalance.toString()]);

    await client.query(`
      INSERT INTO app.wallet_transactions(
        wallet_id, currency_code, type, delta_minor, balance_after_minor,
        payment_attempt_id, created_by_user_id, reason_code, idempotency_key
      )
      VALUES ($1,$2,'payment_topup',$3,$4,$5,$6,'nextpay_verified',$7)
    `, [
      current.wallet_id,
      current.currency_code,
      current.amount_minor,
      newBalance.toString(),
      current.id,
      current.user_id,
      `payment-topup:${current.id}:credit`,
    ]);

    await client.query(`
      UPDATE app.payment_attempts
      SET status='succeeded', completed_at=now()
      WHERE id=$1
    `, [current.id]);

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'payment_verified','payment_attempt',$2,
              jsonb_build_object('provider','nextpay','providerReference',$3,'providerCode',$4,'amountMinor',$5,'currencyCode',$6))
    `, [
      current.user_id,
      current.id,
      verified.providerReference,
      verified.providerCode,
      current.amount_minor,
      current.currency_code,
    ]);

    return { balanceMinor: newBalance.toString(), idempotent: false };
  });

  sendJson(res, 200, {
    ok: true,
    status: 'succeeded',
    attemptId: row.id,
    currencyCode: row.currency_code,
    amountMinor: row.amount_minor,
    balanceMinor: credited.balanceMinor,
    idempotent: credited.idempotent,
  });
}
