import type { PoolClient } from 'pg';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { previewCallSettlementBigInt } from '../../../../packages/domain/src/billing.ts';

export type CallTerminalStatus = 'completed' | 'missed' | 'failed' | 'cancelled' | 'safety_terminated';
export type CallLifecycleEvent =
  | { type: 'caller_answered'; occurredAt: Date }
  | { type: 'calling_listener'; occurredAt: Date }
  | { type: 'connected'; occurredAt: Date }
  | { type: 'ended'; occurredAt: Date; status: 'completed' | 'missed' | 'failed'; reason: string };

const terminalStatuses = new Set<CallTerminalStatus>(['completed', 'missed', 'failed', 'cancelled', 'safety_terminated']);
const preConnectedStatuses = new Set(['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener']);

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('invalid lifecycle timestamp');
}

function boundedReason(value: string): string {
  const reason = value.trim();
  if (!reason) return 'call_ended';
  return reason.slice(0, 120);
}

async function transition(
  client: PoolClient,
  callId: string,
  from: string,
  to: 'caller_answered' | 'calling_listener',
  occurredAt: Date,
) {
  const current = await client.query<{ status: string }>(
    'SELECT status::text FROM app.call_sessions WHERE id=$1 FOR UPDATE',
    [callId],
  );
  const row = current.rows[0];
  if (!row) throw new Error('call_not_found');
  if (row.status === to) return { status: to, idempotent: true };
  if (terminalStatuses.has(row.status as CallTerminalStatus) || row.status === 'connected') {
    return { status: row.status, idempotent: true };
  }
  if (row.status !== from) throw new Error(`invalid_call_transition:${row.status}:${to}`);

  await client.query(
    'UPDATE app.call_sessions SET status=$2::app.call_status, updated_at=$3 WHERE id=$1',
    [callId, to, occurredAt],
  );
  await client.query(
    `INSERT INTO app.call_events(call_session_id, status, source, metadata)
     VALUES ($1,$2::app.call_status,'telephony',jsonb_build_object('occurredAt',$3::text))`,
    [callId, to, occurredAt.toISOString()],
  );
  return { status: to, idempotent: false };
}

async function markConnected(client: PoolClient, callId: string, occurredAt: Date) {
  const current = await client.query<{ status: string; connected_at: string | null }>(
    'SELECT status::text, connected_at::text FROM app.call_sessions WHERE id=$1 FOR UPDATE',
    [callId],
  );
  const row = current.rows[0];
  if (!row) throw new Error('call_not_found');
  if (row.status === 'connected') return { status: 'connected', idempotent: true };
  if (terminalStatuses.has(row.status as CallTerminalStatus)) return { status: row.status, idempotent: true };
  if (row.status !== 'calling_listener') throw new Error(`invalid_call_transition:${row.status}:connected`);

  await client.query(`
    UPDATE app.call_sessions
    SET status='connected', connected_at=COALESCE(connected_at,$2), billing_started_at=COALESCE(billing_started_at,$2), updated_at=$2
    WHERE id=$1
  `, [callId, occurredAt]);
  await client.query(`
    INSERT INTO app.call_events(call_session_id, status, source, metadata)
    VALUES ($1,'connected','telephony',jsonb_build_object('occurredAt',$2::text))
  `, [callId, occurredAt.toISOString()]);
  return { status: 'connected', idempotent: false };
}

export async function settleCallInTransaction(
  client: PoolClient,
  callId: string,
  terminalStatus: CallTerminalStatus,
  endedReason: string,
  endedAt: Date,
) {
  assertValidDate(endedAt);
  if (!terminalStatuses.has(terminalStatus)) throw new Error('invalid_terminal_status');

  const call = await client.query<{
    id: string;
    status: string;
    caller_user_id: string;
    listener_user_id: string | null;
    market_id: string;
    currency_code: string;
    authorized_minor: string;
    max_billable_seconds: number | null;
    caller_rate_per_minute_minor: string;
    listener_rate_per_minute_minor: string;
    pricing_plan_id: string | null;
    connected_at: string | null;
    billing_started_at: string | null;
    caller_charge_minor: string;
    listener_earning_minor: string;
    telephony_cost_minor: string;
    payment_cost_minor: string;
    other_variable_cost_minor: string;
  }>(`
    SELECT id::text, status::text, caller_user_id::text, listener_user_id::text, market_id::text,
           currency_code, authorized_minor::text, max_billable_seconds,
           caller_rate_per_minute_minor::text, listener_rate_per_minute_minor::text,
           pricing_plan_id::text, connected_at::text, billing_started_at::text,
           caller_charge_minor::text, listener_earning_minor::text,
           telephony_cost_minor::text, payment_cost_minor::text, other_variable_cost_minor::text
    FROM app.call_sessions
    WHERE id=$1
    FOR UPDATE
  `, [callId]);
  const row = call.rows[0];
  if (!row) throw new Error('call_not_found');
  if (terminalStatuses.has(row.status as CallTerminalStatus)) {
    return {
      status: row.status,
      idempotent: true,
      billableSeconds: null,
      callerChargeMinor: BigInt(row.caller_charge_minor),
      listenerEarningMinor: BigInt(row.listener_earning_minor),
    };
  }
  if (!preConnectedStatuses.has(row.status) && row.status !== 'connected') {
    throw new Error(`invalid_terminal_transition:${row.status}:${terminalStatus}`);
  }

  const authorizedMinor = BigInt(row.authorized_minor);
  let billableSeconds = 0;
  let callerChargeMinor = 0n;
  let listenerEarningMinor = 0n;
  let grossSpreadMinor = 0n;

  if (row.status === 'connected') {
    if (!row.listener_user_id || !row.billing_started_at || !row.connected_at || !row.pricing_plan_id || !row.max_billable_seconds) {
      throw new Error('connected_call_missing_billing_context');
    }
    const pricing = await client.query<{ billing_increment_seconds: number }>(`
      SELECT billing_increment_seconds
      FROM app.pricing_plans
      WHERE id=$1
    `, [row.pricing_plan_id]);
    const increment = pricing.rows[0]?.billing_increment_seconds;
    if (!increment) throw new Error('pricing_plan_missing');

    const billingStartMs = new Date(row.billing_started_at).getTime();
    const rawConnectedSeconds = Math.max(0, Math.floor((endedAt.getTime() - billingStartMs) / 1000));
    const cappedConnectedSeconds = Math.min(rawConnectedSeconds, row.max_billable_seconds);
    const settlement = previewCallSettlementBigInt(
      BigInt(row.caller_rate_per_minute_minor),
      BigInt(row.listener_rate_per_minute_minor),
      cappedConnectedSeconds,
      increment,
    );
    if (settlement.billableSeconds > row.max_billable_seconds) throw new Error('billable_seconds_exceed_authorization');
    if (settlement.callerChargeMinor > authorizedMinor) throw new Error('caller_charge_exceeds_authorization');
    billableSeconds = settlement.billableSeconds;
    callerChargeMinor = settlement.callerChargeMinor;
    listenerEarningMinor = settlement.listenerEarningMinor;
    grossSpreadMinor = settlement.platformGrossSpreadMinor;
  }

  const wallet = await client.query<{ id: string; balance_minor: string; reserved_minor: string }>(`
    SELECT id::text, balance_minor::text, reserved_minor::text
    FROM app.wallets
    WHERE user_id=$1 AND currency_code=$2
    FOR UPDATE
  `, [row.caller_user_id, row.currency_code]);
  const walletRow = wallet.rows[0];
  if (!walletRow) throw new Error('wallet_unavailable');
  if (BigInt(walletRow.reserved_minor) < authorizedMinor) throw new Error('wallet_reservation_invariant_violated');
  if (BigInt(walletRow.balance_minor) < callerChargeMinor) throw new Error('wallet_balance_invariant_violated');

  const updatedWallet = await client.query<{ id: string; balance_minor: string }>(`
    UPDATE app.wallets
    SET balance_minor=balance_minor-$3::bigint,
        reserved_minor=reserved_minor-$4::bigint,
        version=version+1,
        updated_at=now()
    WHERE id=$1 AND currency_code=$2
      AND balance_minor >= $3::bigint
      AND reserved_minor >= $4::bigint
    RETURNING id::text, balance_minor::text
  `, [walletRow.id, row.currency_code, callerChargeMinor.toString(), authorizedMinor.toString()]);
  const walletAfter = updatedWallet.rows[0];
  if (!walletAfter) throw new Error('wallet_settlement_conflict');

  if (callerChargeMinor > 0n) {
    await client.query(`
      INSERT INTO app.wallet_transactions(
        wallet_id, currency_code, type, delta_minor, balance_after_minor,
        call_session_id, reason_code, idempotency_key
      )
      VALUES ($1,$2,'call_charge',$3::bigint,$4::bigint,$5,'call_settlement',$6)
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      walletRow.id,
      row.currency_code,
      (-callerChargeMinor).toString(),
      walletAfter.balance_minor,
      callId,
      `call-settlement:${callId}`,
    ]);
  }

  if (listenerEarningMinor > 0n) {
    if (!row.listener_user_id) throw new Error('listener_missing_for_earning');
    await client.query(`
      INSERT INTO app.listener_earnings(
        listener_user_id, call_session_id, market_id, currency_code, amount_minor, status
      )
      VALUES ($1,$2,$3,$4,$5::bigint,'pending')
      ON CONFLICT (call_session_id) DO NOTHING
    `, [row.listener_user_id, callId, row.market_id, row.currency_code, listenerEarningMinor.toString()]);
  }

  const contribution = grossSpreadMinor
    - BigInt(row.telephony_cost_minor)
    - BigInt(row.payment_cost_minor)
    - BigInt(row.other_variable_cost_minor);

  await client.query(`
    UPDATE app.call_sessions
    SET status=$2::app.call_status,
        ended_at=COALESCE(ended_at,$3),
        ended_reason=$4,
        billable_seconds=$5,
        caller_charge_minor=$6::bigint,
        listener_earning_minor=$7::bigint,
        platform_contribution_minor=$8::bigint,
        updated_at=now()
    WHERE id=$1
  `, [
    callId,
    terminalStatus,
    endedAt,
    boundedReason(endedReason),
    billableSeconds,
    callerChargeMinor.toString(),
    listenerEarningMinor.toString(),
    contribution.toString(),
  ]);
  await client.query(`
    INSERT INTO app.call_events(call_session_id, status, source, metadata)
    VALUES ($1,$2::app.call_status,'telephony',jsonb_build_object(
      'reason',$3::text,
      'billableSeconds',$4::int,
      'callerChargeMinor',$5::text,
      'listenerEarningMinor',$6::text
    ))
  `, [
    callId,
    terminalStatus,
    boundedReason(endedReason),
    billableSeconds,
    callerChargeMinor.toString(),
    listenerEarningMinor.toString(),
  ]);

  return {
    status: terminalStatus,
    idempotent: false,
    billableSeconds,
    callerChargeMinor,
    listenerEarningMinor,
  };
}

export async function applyCallLifecycleEvent(callId: string, event: CallLifecycleEvent) {
  assertValidDate(event.occurredAt);
  return withTransaction(async (client) => {
    if (event.type === 'caller_answered') {
      return transition(client, callId, 'calling_caller', 'caller_answered', event.occurredAt);
    }
    if (event.type === 'calling_listener') {
      return transition(client, callId, 'caller_answered', 'calling_listener', event.occurredAt);
    }
    if (event.type === 'connected') {
      return markConnected(client, callId, event.occurredAt);
    }
    return settleCallInTransaction(client, callId, event.status, event.reason, event.occurredAt);
  });
}
