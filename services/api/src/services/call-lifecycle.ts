import { withTransaction } from '../../../../packages/db/src/client.ts';
import { previewCallSettlementBigInt } from '../../../../packages/domain/src/billing.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRE_CONNECTED_STATUSES = ['calling_caller', 'caller_answered', 'calling_listener'] as const;
const TERMINATION_EVENT_REASONS = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

type TransactionClient = Parameters<Parameters<typeof withTransaction>[0]>[0];

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new Error('invalid_call');
}

function assertBridgeId(providerBridgeId: string): void {
  if (!providerBridgeId.trim() || providerBridgeId.length > 255) throw new Error('invalid_provider_bridge_id');
}

function eventDate(value: Date | undefined, code: string): Date {
  const date = value ?? new Date();
  if (!Number.isFinite(date.getTime())) throw new Error(code);
  return date;
}

async function hasTerminationIntent(client: TransactionClient, callId: string): Promise<boolean> {
  const result = await client.query(`
    SELECT 1
    FROM app.call_events
    WHERE call_session_id=$1
      AND metadata->>'reason' = ANY($2::text[])
    LIMIT 1
  `, [callId, TERMINATION_EVENT_REASONS]);
  return Boolean(result.rowCount);
}

async function transitionByProvider(input: {
  callId: string;
  providerBridgeId: string;
  fromStatus: 'calling_caller' | 'caller_answered';
  toStatus: 'caller_answered' | 'calling_listener';
  occurredAt?: Date;
}) {
  assertCallId(input.callId);
  assertBridgeId(input.providerBridgeId);
  const occurredAt = eventDate(input.occurredAt, 'invalid_transition_at');

  return withTransaction(async (client) => {
    const call = await client.query<{ status: string; provider_bridge_id: string | null }>(`
      SELECT status::text, provider_bridge_id
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [input.callId]);
    const row = call.rows[0];
    if (!row) throw new Error('call_not_found');
    if (row.provider_bridge_id !== input.providerBridgeId) throw new Error('provider_bridge_mismatch');
    if (row.status === input.toStatus) {
      return { callId: input.callId, status: input.toStatus, idempotent: true };
    }
    if (input.toStatus === 'caller_answered' && row.status === 'calling_listener') {
      return { callId: input.callId, status: row.status, idempotent: true };
    }
    if (['connected', 'completed', 'missed', 'failed', 'cancelled', 'safety_terminated'].includes(row.status)) {
      return { callId: input.callId, status: row.status, idempotent: true };
    }
    if (row.status !== input.fromStatus) throw new Error('invalid_call_transition');
    if (await hasTerminationIntent(client, input.callId)) throw new Error('call_termination_in_progress');

    await client.query(`
      UPDATE app.call_sessions
      SET status=$2::app.call_status, updated_at=now()
      WHERE id=$1
    `, [input.callId, input.toStatus]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,$2::app.call_status,'telephony',jsonb_build_object('occurredAt',$3::text))
    `, [input.callId, input.toStatus, occurredAt.toISOString()]);
    return { callId: input.callId, status: input.toStatus, idempotent: false };
  });
}

export function markCallerAnsweredByProvider(input: {
  callId: string;
  providerBridgeId: string;
  answeredAt?: Date;
}) {
  return transitionByProvider({
    callId: input.callId,
    providerBridgeId: input.providerBridgeId,
    fromStatus: 'calling_caller',
    toStatus: 'caller_answered',
    occurredAt: input.answeredAt,
  });
}

export function markCallingListenerByProvider(input: {
  callId: string;
  providerBridgeId: string;
  startedAt?: Date;
}) {
  return transitionByProvider({
    callId: input.callId,
    providerBridgeId: input.providerBridgeId,
    fromStatus: 'caller_answered',
    toStatus: 'calling_listener',
    occurredAt: input.startedAt,
  });
}

export async function markCallConnectedByProvider(input: {
  callId: string;
  providerBridgeId: string;
  connectedAt?: Date;
}): Promise<{ callId: string; status: 'connected'; idempotent: boolean }> {
  assertCallId(input.callId);
  assertBridgeId(input.providerBridgeId);
  const connectedAt = eventDate(input.connectedAt, 'invalid_connected_at');

  return withTransaction(async (client) => {
    const call = await client.query<{ status: string; provider_bridge_id: string | null }>(`
      SELECT status::text, provider_bridge_id
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [input.callId]);
    const row = call.rows[0];
    if (!row) throw new Error('call_not_found');
    if (row.provider_bridge_id !== input.providerBridgeId) throw new Error('provider_bridge_mismatch');
    if (row.status === 'connected') {
      return { callId: input.callId, status: 'connected' as const, idempotent: true };
    }
    if (row.status !== 'calling_listener') throw new Error('call_cannot_connect');
    if (await hasTerminationIntent(client, input.callId)) throw new Error('call_termination_in_progress');

    await client.query(`
      UPDATE app.call_sessions
      SET status='connected', connected_at=COALESCE(connected_at,$2),
          billing_started_at=COALESCE(billing_started_at,$2), updated_at=now()
      WHERE id=$1
    `, [input.callId, connectedAt.toISOString()]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'connected','telephony',jsonb_build_object('occurredAt',$2::text))
    `, [input.callId, connectedAt.toISOString()]);
    return { callId: input.callId, status: 'connected' as const, idempotent: false };
  });
}

export async function endUnconnectedCallByProvider(input: {
  callId: string;
  providerBridgeId: string;
  status: 'missed' | 'failed';
  endedReason?: string;
  endedAt?: Date;
}): Promise<{ callId: string; status: 'missed' | 'failed'; idempotent: boolean }> {
  assertCallId(input.callId);
  assertBridgeId(input.providerBridgeId);
  const endedAt = eventDate(input.endedAt, 'invalid_ended_at');
  const endedReason = (input.endedReason?.trim() || `provider_${input.status}`).slice(0, 120);

  return withTransaction(async (client) => {
    const call = await client.query<{
      status: string;
      caller_user_id: string;
      currency_code: string;
      authorized_minor: string;
      provider_bridge_id: string | null;
    }>(`
      SELECT status::text, caller_user_id::text, currency_code, authorized_minor::text, provider_bridge_id
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [input.callId]);
    const row = call.rows[0];
    if (!row) throw new Error('call_not_found');
    if (row.provider_bridge_id !== input.providerBridgeId) throw new Error('provider_bridge_mismatch');
    if (row.status === input.status) return { callId: input.callId, status: input.status, idempotent: true };
    if (!PRE_CONNECTED_STATUSES.includes(row.status as (typeof PRE_CONNECTED_STATUSES)[number])) {
      throw new Error('call_not_unconnected_terminal');
    }
    if (await hasTerminationIntent(client, input.callId)) throw new Error('call_termination_in_progress');

    const authorized = BigInt(row.authorized_minor);
    if (authorized > 0n) {
      const released = await client.query(`
        UPDATE app.wallets
        SET reserved_minor=reserved_minor-$3::bigint, version=version+1, updated_at=now()
        WHERE user_id=$1 AND currency_code=$2 AND reserved_minor >= $3::bigint
        RETURNING id
      `, [row.caller_user_id, row.currency_code, authorized.toString()]);
      if (!released.rowCount) throw new Error('wallet_release_conflict');
    }

    await client.query(`
      UPDATE app.call_sessions
      SET status=$2::app.call_status, ended_at=COALESCE(ended_at,$3), ended_reason=$4, updated_at=now()
      WHERE id=$1
    `, [input.callId, input.status, endedAt.toISOString(), endedReason]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,$2::app.call_status,'telephony',jsonb_build_object('reason',$3::text,'occurredAt',$4::text))
    `, [input.callId, input.status, endedReason, endedAt.toISOString()]);
    return { callId: input.callId, status: input.status, idempotent: false };
  });
}

export async function settleCallByProvider(input: {
  callId: string;
  providerBridgeId: string;
  connectedSeconds: number;
  endedReason?: string;
}): Promise<{
  callId: string;
  status: 'completed' | 'safety_terminated';
  billableSeconds: number;
  callerChargeMinor: string;
  listenerEarningMinor: string;
  idempotent: boolean;
}> {
  assertCallId(input.callId);
  assertBridgeId(input.providerBridgeId);
  if (!Number.isSafeInteger(input.connectedSeconds) || input.connectedSeconds < 0) throw new Error('invalid_connected_seconds');
  const endedReason = (input.endedReason?.trim() || 'provider_completed').slice(0, 120);

  return withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      status: string;
      caller_user_id: string;
      listener_user_id: string | null;
      market_id: string;
      pricing_plan_id: string | null;
      currency_code: string;
      caller_rate: string;
      listener_rate: string;
      authorized_minor: string;
      max_billable_seconds: number | null;
      provider_bridge_id: string | null;
      connected_at: string | null;
      billable_seconds: number;
      caller_charge_minor: string;
      listener_earning_minor: string;
    }>(`
      SELECT id::text, status::text, caller_user_id::text, listener_user_id::text,
             market_id::text, pricing_plan_id::text, currency_code,
             caller_rate_per_minute_minor::text caller_rate,
             listener_rate_per_minute_minor::text listener_rate,
             authorized_minor::text, max_billable_seconds, provider_bridge_id,
             connected_at::text, billable_seconds, caller_charge_minor::text,
             listener_earning_minor::text
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [input.callId]);
    const row = call.rows[0];
    if (!row) throw new Error('call_not_found');
    if (row.provider_bridge_id !== input.providerBridgeId) throw new Error('provider_bridge_mismatch');

    if (row.status === 'completed') {
      return {
        callId: row.id,
        status: 'completed' as const,
        billableSeconds: row.billable_seconds,
        callerChargeMinor: row.caller_charge_minor,
        listenerEarningMinor: row.listener_earning_minor,
        idempotent: true,
      };
    }
    const safetyTerminated = row.status === 'safety_terminated';
    if (row.status !== 'connected' && !safetyTerminated) throw new Error('call_not_settleable');
    if (!safetyTerminated && await hasTerminationIntent(client, input.callId)) {
      throw new Error('call_termination_in_progress');
    }

    if (safetyTerminated) {
      const alreadySettled = await client.query(`
        SELECT 1
        FROM app.call_events
        WHERE call_session_id=$1 AND status='safety_terminated' AND source='telephony'
        LIMIT 1
      `, [row.id]);
      if (alreadySettled.rowCount) {
        return {
          callId: row.id,
          status: 'safety_terminated' as const,
          billableSeconds: row.billable_seconds,
          callerChargeMinor: row.caller_charge_minor,
          listenerEarningMinor: row.listener_earning_minor,
          idempotent: true,
        };
      }
    }

    if (!row.connected_at) {
      if (safetyTerminated && input.connectedSeconds === 0) {
        return {
          callId: row.id,
          status: 'safety_terminated' as const,
          billableSeconds: 0,
          callerChargeMinor: '0',
          listenerEarningMinor: '0',
          idempotent: true,
        };
      }
      throw new Error('call_missing_connected_at');
    }
    if (!row.listener_user_id || !row.pricing_plan_id || !row.max_billable_seconds) throw new Error('call_missing_settlement_context');

    const pricing = await client.query<{ billing_increment_seconds: number }>(`
      SELECT billing_increment_seconds
      FROM app.pricing_plans
      WHERE id=$1
    `, [row.pricing_plan_id]);
    const increment = pricing.rows[0]?.billing_increment_seconds;
    if (!increment) throw new Error('pricing_plan_unavailable');

    const boundedConnectedSeconds = Math.min(input.connectedSeconds, row.max_billable_seconds);
    const settlement = previewCallSettlementBigInt(
      BigInt(row.caller_rate),
      BigInt(row.listener_rate),
      boundedConnectedSeconds,
      increment,
    );
    if (settlement.billableSeconds > row.max_billable_seconds) throw new Error('settlement_exceeds_authorized_seconds');

    const authorized = BigInt(row.authorized_minor);
    const charge = settlement.callerChargeMinor;
    const earning = settlement.listenerEarningMinor;
    if (charge > authorized) throw new Error('settlement_exceeds_authorization');
    if (earning > charge) throw new Error('negative_platform_spread');

    const wallet = await client.query<{ id: string; balance_minor: string; reserved_minor: string }>(`
      SELECT id::text, balance_minor::text, reserved_minor::text
      FROM app.wallets
      WHERE user_id=$1 AND currency_code=$2
      FOR UPDATE
    `, [row.caller_user_id, row.currency_code]);
    const walletRow = wallet.rows[0];
    if (!walletRow) throw new Error('wallet_unavailable');
    if (BigInt(walletRow.reserved_minor) < authorized) throw new Error('wallet_reservation_missing');
    if (BigInt(walletRow.balance_minor) < charge) throw new Error('wallet_balance_conflict');

    const walletUpdate = await client.query<{ id: string; balance_minor: string }>(`
      UPDATE app.wallets
      SET balance_minor=balance_minor-$2::bigint,
          reserved_minor=reserved_minor-$3::bigint,
          version=version+1,
          updated_at=now()
      WHERE id=$1 AND balance_minor >= $2::bigint AND reserved_minor >= $3::bigint
      RETURNING id::text, balance_minor::text
    `, [walletRow.id, charge.toString(), authorized.toString()]);
    const updatedWallet = walletUpdate.rows[0];
    if (!updatedWallet) throw new Error('wallet_settlement_conflict');

    if (charge > 0n) {
      await client.query(`
        INSERT INTO app.wallet_transactions(
          wallet_id, currency_code, type, delta_minor, balance_after_minor,
          call_session_id, reason_code, idempotency_key
        )
        VALUES ($1,$2,'call_charge',$3,$4,$5,'call_completed',$6)
      `, [
        walletRow.id,
        row.currency_code,
        (-charge).toString(),
        updatedWallet.balance_minor,
        row.id,
        `call:${row.id}:charge`,
      ]);
    }

    if (earning > 0n) {
      await client.query(`
        INSERT INTO app.listener_earnings(
          listener_user_id, call_session_id, market_id, currency_code, amount_minor, status
        )
        VALUES ($1,$2,$3,$4,$5,'pending')
      `, [row.listener_user_id, row.id, row.market_id, row.currency_code, earning.toString()]);
    }

    const finalStatus = safetyTerminated ? 'safety_terminated' : 'completed';
    await client.query(`
      UPDATE app.call_sessions
      SET status=$2,
          ended_at=COALESCE(ended_at, now()),
          ended_reason=CASE WHEN $2='completed' THEN $3 ELSE COALESCE(ended_reason,$3) END,
          billable_seconds=$4,
          caller_charge_minor=$5,
          listener_earning_minor=$6,
          platform_contribution_minor=$5::bigint-$6::bigint-telephony_cost_minor-payment_cost_minor-other_variable_cost_minor,
          updated_at=now()
      WHERE id=$1
    `, [row.id, finalStatus, endedReason, settlement.billableSeconds, charge.toString(), earning.toString()]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,$2,'telephony',jsonb_build_object('billableSeconds',$3,'callerChargeMinor',$4::text,'listenerEarningMinor',$5::text))
    `, [row.id, finalStatus, settlement.billableSeconds, charge.toString(), earning.toString()]);

    return {
      callId: row.id,
      status: finalStatus as 'completed' | 'safety_terminated',
      billableSeconds: settlement.billableSeconds,
      callerChargeMinor: charge.toString(),
      listenerEarningMinor: earning.toString(),
      idempotent: false,
    };
  });
}