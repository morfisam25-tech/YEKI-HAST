import type { PoolClient } from 'pg';
import { HttpError } from '../lib/http.ts';

export const INTERNAL_BETA_ADMIN_CREDIT = 'INTERNAL_BETA_ADMIN_CREDIT' as const;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

export type InternalBetaAdminCreditInput = {
  adminUserId: string;
  adminRole: string;
  targetUserId: string;
  amountMinor: bigint;
  currencyCode: string;
  reason: string;
  idempotencyKey: string;
};

export type InternalBetaAdminCreditResult = {
  transactionId: string;
  walletId: string;
  targetUserId: string;
  amountMinor: string;
  currencyCode: string;
  balanceMinor: string;
  availableMinor: string;
  operationType: typeof INTERNAL_BETA_ADMIN_CREDIT;
  idempotencyReference: string;
  idempotent: boolean;
};

type ExistingCreditRow = {
  transaction_id: string;
  wallet_id: string;
  target_user_id: string;
  delta_minor: string;
  currency_code: string;
  balance_after_minor: string;
  current_balance_minor: string;
  reserved_minor: string;
  reason: string | null;
  operation_type: string | null;
};

function sameRequest(row: ExistingCreditRow, input: InternalBetaAdminCreditInput): boolean {
  return row.target_user_id === input.targetUserId
    && BigInt(row.delta_minor) === input.amountMinor
    && row.currency_code === input.currencyCode
    && row.reason === input.reason
    && row.operation_type === INTERNAL_BETA_ADMIN_CREDIT;
}

export async function applyInternalBetaAdminCredit(
  client: Pick<PoolClient, 'query'>,
  input: InternalBetaAdminCreditInput,
): Promise<InternalBetaAdminCreditResult> {
  const idempotencyReference = `internal-beta-admin-credit:${input.adminUserId}:${input.idempotencyKey}`;

  // Serialize the full operation before looking up the unique ledger key. This makes
  // simultaneous retries behave like ordinary idempotent retries rather than one
  // request surfacing a transient unique-constraint error.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [idempotencyReference]);

  const existing = await client.query<ExistingCreditRow>(`
    SELECT wt.id::text AS transaction_id,
           wt.wallet_id::text,
           w.user_id::text AS target_user_id,
           wt.delta_minor::text,
           wt.currency_code,
           wt.balance_after_minor::text,
           w.balance_minor::text AS current_balance_minor,
           w.reserved_minor::text,
           audit.metadata->>'reason' AS reason,
           audit.metadata->>'operationType' AS operation_type
    FROM app.wallet_transactions wt
    JOIN app.wallets w ON w.id=wt.wallet_id AND w.currency_code=wt.currency_code
    LEFT JOIN LATERAL (
      SELECT metadata
      FROM app.audit_logs
      WHERE action=$2 AND entity_type='wallet_transaction' AND entity_id=wt.id::text
      ORDER BY id DESC
      LIMIT 1
    ) audit ON true
    WHERE wt.idempotency_key=$1
    FOR UPDATE OF wt
  `, [idempotencyReference, INTERNAL_BETA_ADMIN_CREDIT]);

  if (existing.rows[0]) {
    if (!sameRequest(existing.rows[0], input)) throw new HttpError(409, 'idempotency_request_mismatch');
    return {
      transactionId: existing.rows[0].transaction_id,
      walletId: existing.rows[0].wallet_id,
      targetUserId: existing.rows[0].target_user_id,
      amountMinor: existing.rows[0].delta_minor,
      currencyCode: existing.rows[0].currency_code,
      balanceMinor: existing.rows[0].current_balance_minor,
      availableMinor: (BigInt(existing.rows[0].current_balance_minor) - BigInt(existing.rows[0].reserved_minor)).toString(),
      operationType: INTERNAL_BETA_ADMIN_CREDIT,
      idempotencyReference,
      idempotent: true,
    };
  }

  const user = await client.query<{ id: string }>(`
    SELECT id::text
    FROM app.users
    WHERE id=$1 AND archived_at IS NULL
    FOR SHARE
  `, [input.targetUserId]);
  if (!user.rows[0]) throw new HttpError(404, 'target_user_not_found');

  const currency = await client.query<{ code: string }>(
    'SELECT code FROM app.currencies WHERE code=$1',
    [input.currencyCode],
  );
  if (!currency.rows[0]) throw new HttpError(400, 'invalid_currency');

  await client.query(`
    INSERT INTO app.wallets(user_id, currency_code)
    VALUES ($1,$2)
    ON CONFLICT (user_id, currency_code) DO NOTHING
  `, [input.targetUserId, input.currencyCode]);

  const wallet = await client.query<{ id: string; balance_minor: string; reserved_minor: string }>(`
    SELECT id::text, balance_minor::text, reserved_minor::text
    FROM app.wallets
    WHERE user_id=$1 AND currency_code=$2
    FOR UPDATE
  `, [input.targetUserId, input.currencyCode]);
  if (!wallet.rows[0]) throw new HttpError(503, 'wallet_unavailable');

  const newBalance = BigInt(wallet.rows[0].balance_minor) + input.amountMinor;
  if (newBalance > MAX_BIGINT) throw new HttpError(409, 'wallet_balance_overflow');

  const updated = await client.query<{ balance_minor: string }>(`
    UPDATE app.wallets
    SET balance_minor=$2::bigint, version=version+1
    WHERE id=$1 AND balance_minor=$3::bigint
    RETURNING balance_minor::text
  `, [wallet.rows[0].id, newBalance.toString(), wallet.rows[0].balance_minor]);
  if (!updated.rows[0]) throw new HttpError(409, 'wallet_balance_conflict');

  const transaction = await client.query<{ id: string; created_at: string }>(`
    INSERT INTO app.wallet_transactions(
      wallet_id, currency_code, type, delta_minor, balance_after_minor,
      created_by_user_id, reason_code, idempotency_key
    )
    VALUES ($1,$2,'manual_credit',$3,$4,$5,$6,$7)
    RETURNING id::text, created_at::text
  `, [
    wallet.rows[0].id,
    input.currencyCode,
    input.amountMinor.toString(),
    newBalance.toString(),
    input.adminUserId,
    INTERNAL_BETA_ADMIN_CREDIT,
    idempotencyReference,
  ]);
  const transactionRow = transaction.rows[0];
  if (!transactionRow) throw new HttpError(500, 'wallet_credit_failed');

  await client.query(`
    INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1,$2,'wallet_transaction',$3,
            jsonb_build_object(
              'adminActorUserId',$1::text,
              'adminRole',$4::text,
              'targetUserId',$5::text,
              'amountMinor',$6::text,
              'currencyCode',$7::text,
              'reason',$8::text,
              'operationType',$2::text,
              'operationTimestamp',$9::text,
              'idempotencyReference',$10::text
            ))
  `, [
    input.adminUserId,
    INTERNAL_BETA_ADMIN_CREDIT,
    transactionRow.id,
    input.adminRole,
    input.targetUserId,
    input.amountMinor.toString(),
    input.currencyCode,
    input.reason,
    transactionRow.created_at,
    idempotencyReference,
  ]);

  return {
    transactionId: transactionRow.id,
    walletId: wallet.rows[0].id,
    targetUserId: input.targetUserId,
    amountMinor: input.amountMinor.toString(),
    currencyCode: input.currencyCode,
    balanceMinor: updated.rows[0].balance_minor,
    availableMinor: (BigInt(updated.rows[0].balance_minor) - BigInt(wallet.rows[0].reserved_minor)).toString(),
    operationType: INTERNAL_BETA_ADMIN_CREDIT,
    idempotencyReference,
    idempotent: false,
  };
}
