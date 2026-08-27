import { withTransaction } from '../../../../packages/db/src/client.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new Error('invalid_call');
}

function assertBridgeId(providerBridgeId: string): void {
  if (!providerBridgeId.trim() || providerBridgeId.length > 255) throw new Error('invalid_provider_bridge_id');
}

function roundUpSeconds(seconds: number, increment: number): number {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('invalid_connected_seconds');
  if (!Number.isSafeInteger(increment) || increment < 1 || increment > 60) throw new Error('invalid_billing_increment');
  if (seconds === 0) return 0;
  return Math.ceil(seconds / increment) * increment;
}

function callerCharge(ratePerMinuteMinor: bigint, billableSeconds: number): bigint {
  return (ratePerMinuteMinor * BigInt(billableSeconds) + 59n) / 60n;
}

function listenerEarning(ratePerMinuteMinor: bigint, billableSeconds: number): bigint {
  return (ratePerMinuteMinor * BigInt(billableSeconds)) / 60n;
}

export async function markCallConnectedByProvider(input: {
  callId: string;
  providerBridgeId: string;
  connectedAt?: Date;
}): Promise<{ callId: string; status: 'connected'; idempotent: boolean }> {
  assertCallId(input.callId);
  assertBridgeId(input.providerBridgeId);
  const connectedAt = input.connectedAt ?? new Date();
  if (!Number.isFinite(connectedAt.getTime())) throw new Error('invalid_connected_at');

  return withTransaction(async (client) => {
    const call = await client.query<{ status: string; provider_bridge_id: string | null; connected_at: string | null }>(`
      SELECT status::text, provider_bridge_id, connected_at::text
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
    if (!['calling_caller', 'caller_answered', 'calling_listener'].includes(row.status)) {
      throw new Error('call_cannot_connect');
    }

    await client.query(`
      UPDATE app.call_sessions
      SET status='connected', connected_at=COALESCE(connected_at,$2),
          billing_started_at=COALESCE(billing_started_at,$2), updated_at=now()
      WHERE id=$1
    `, [input.callId, connectedAt.toISOString()]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source)
      VALUES ($1,'connected','telephony')
    `, [input.callId]);
    return { callId: input.callId, status: 'connected' as const, idempotent: false };
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
    const billableSeconds = roundUpSeconds(boundedConnectedSeconds, increment);
    if (billableSeconds > row.max_billable_seconds) throw new Error('settlement_exceeds_authorized_seconds');

    const callerRate = BigInt(row.caller_rate);
    const listenerRate = BigInt(row.listener_rate);
    const authorized = BigInt(row.authorized_minor);
    const charge = callerCharge(callerRate, billableSeconds);
    const earning = listenerEarning(listenerRate, billableSeconds);
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
          version=version+1
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
    `, [row.id, finalStatus, endedReason, billableSeconds, charge.toString(), earning.toString()]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,$2,'telephony',jsonb_build_object('billableSeconds',$3))
    `, [row.id, finalStatus, billableSeconds]);

    return {
      callId: row.id,
      status: finalStatus as 'completed' | 'safety_terminated',
      billableSeconds,
      callerChargeMinor: charge.toString(),
      listenerEarningMinor: earning.toString(),
      idempotent: false,
    };
  });
}
