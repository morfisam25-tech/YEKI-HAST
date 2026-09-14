import { withTransaction } from '../../../../packages/db/src/client.ts';
import { previewCallSettlementBigInt } from '../../../../packages/domain/src/billing.ts';
import { stopRecordingForCall } from './recording-lifecycle.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ParticipantRole = 'caller' | 'listener';

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new Error('invalid_call');
}

export async function settleInternetVoiceCall(input: {
  callId: string;
  endedByRole: ParticipantRole;
  safety?: boolean;
  endedReason?: string;
  effectiveEndAt?: string | null;
}): Promise<{
  callId: string;
  status: 'completed' | 'safety_terminated';
  billableSeconds: number;
  callerChargeMinor: string;
  listenerEarningMinor: string;
  idempotent: boolean;
}> {
  assertCallId(input.callId);
  const endedReason = (input.endedReason?.trim() || (input.safety ? 'internet_voice_safety_exit' : 'internet_voice_completed')).slice(0, 120);

  const settlement = await withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      status: string;
      transport: string | null;
      caller_user_id: string;
      listener_user_id: string | null;
      market_id: string;
      pricing_plan_id: string | null;
      currency_code: string;
      listener_currency_code: string | null;
      caller_rate: string;
      listener_rate: string;
      authorized_minor: string;
      max_billable_seconds: number | null;
      connected_at: string | null;
      billing_started_at: string | null;
      connected_seconds: number;
      billable_seconds: number;
      caller_charge_minor: string;
      listener_earning_minor: string;
    }>(`
      SELECT id::text, status::text, transport::text,
             caller_user_id::text, listener_user_id::text,
             market_id::text, pricing_plan_id::text, currency_code,
             listener_currency_code,
             caller_rate_per_minute_minor::text caller_rate,
             listener_rate_per_minute_minor::text listener_rate,
             authorized_minor::text, max_billable_seconds,
             connected_at::text,
             billing_started_at::text,
             -- Billed time is measured from billing_started_at, not
             -- connected_at: for a recording-required call these can now
             -- legitimately differ (see postInternetVoiceSignal's
             -- media_connected billing gate in routes/internet-voice.ts). A
             -- call that connected but whose recording never became
             -- authoritatively active has billing_started_at NULL and is
             -- billed zero seconds, never a positive amount. For every
             -- non-recording-required call the two timestamps are set
             -- together, so this is unchanged from the prior connected_at-
             -- anchored behavior.
             CASE
               WHEN billing_started_at IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                 LEAST(now(), COALESCE($2::timestamptz, now())) - billing_started_at
               )))::int)
             END AS connected_seconds,
             billable_seconds, caller_charge_minor::text,
             listener_earning_minor::text
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [input.callId, input.effectiveEndAt ?? null]);
    const row = call.rows[0];
    if (!row) throw new Error('call_not_found');
    if (row.transport !== 'internet_voice') throw new Error('call_not_internet_voice');

    if (row.status === 'completed' || row.status === 'safety_terminated') {
      return {
        callId: row.id,
        status: row.status as 'completed' | 'safety_terminated',
        billableSeconds: row.billable_seconds,
        callerChargeMinor: row.caller_charge_minor,
        listenerEarningMinor: row.listener_earning_minor,
        idempotent: true,
      };
    }
    if (row.status !== 'connected') throw new Error('call_not_settleable');
    if (!row.connected_at) throw new Error('call_missing_connected_at');
    if (!row.listener_user_id || !row.pricing_plan_id || !row.max_billable_seconds || !row.listener_currency_code) {
      throw new Error('call_missing_settlement_context');
    }

    const pricing = await client.query<{ billing_increment_seconds: number }>(`
      SELECT billing_increment_seconds
      FROM app.pricing_plans
      WHERE id=$1
    `, [row.pricing_plan_id]);
    const increment = pricing.rows[0]?.billing_increment_seconds;
    if (!increment) throw new Error('pricing_plan_unavailable');

    const boundedConnectedSeconds = Math.min(row.connected_seconds, row.max_billable_seconds);
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
    const sameCurrency = row.currency_code === row.listener_currency_code;
    if (charge > authorized) throw new Error('settlement_exceeds_authorization');
    if (sameCurrency && earning > charge) throw new Error('negative_platform_spread');

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
      await client.query(`
        INSERT INTO app.wallet_hold_events(
          wallet_id, call_session_id, currency_code, event_type,
          amount_minor, reason_code, idempotency_key, metadata
        ) VALUES ($1,$2,$3,'consume',$4,'actual_connected_time_charge',$5,$6::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [
        walletRow.id,
        row.id,
        row.currency_code,
        charge.toString(),
        `call:${row.id}:hold:consume`,
        JSON.stringify({ billableSeconds: settlement.billableSeconds }),
      ]);
    }

    const unusedHold = authorized - charge;
    if (unusedHold > 0n) {
      await client.query(`
        INSERT INTO app.wallet_hold_events(
          wallet_id, call_session_id, currency_code, event_type,
          amount_minor, reason_code, idempotency_key, metadata
        ) VALUES ($1,$2,$3,'release',$4,'unused_session_hold',$5,$6::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [
        walletRow.id,
        row.id,
        row.currency_code,
        unusedHold.toString(),
        `call:${row.id}:hold:release:unused`,
        JSON.stringify({ authorizedMinor: authorized.toString(), callerChargeMinor: charge.toString() }),
      ]);
    }

    if (earning > 0n) {
      await client.query(`
        INSERT INTO app.listener_earnings(
          listener_user_id, call_session_id, market_id, currency_code, amount_minor, status
        )
        VALUES ($1,$2,$3,$4,$5,'pending')
        ON CONFLICT (call_session_id) DO NOTHING
      `, [row.listener_user_id, row.id, row.market_id, row.listener_currency_code, earning.toString()]);
    }

    const finalStatus = input.safety ? 'safety_terminated' : 'completed';
    await client.query(`
      UPDATE app.call_sessions
      SET status=$2::app.call_status,
          ended_at=COALESCE(ended_at,now()),
          ended_reason=$3,
          billable_seconds=$4,
          caller_charge_minor=$5,
          listener_earning_minor=$6,
          platform_contribution_minor=CASE
            WHEN currency_code=listener_currency_code
              THEN $5::bigint-$6::bigint-telephony_cost_minor-payment_cost_minor-other_variable_cost_minor
            ELSE NULL
          END,
          updated_at=now()
      WHERE id=$1 AND status='connected' AND transport='internet_voice'
    `, [row.id, finalStatus, endedReason, settlement.billableSeconds, charge.toString(), earning.toString()]);

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,$2::app.call_status,'api',$3::jsonb)
    `, [row.id, finalStatus, JSON.stringify({
      reason: endedReason,
      transport: 'internet_voice',
      endedByRole: input.endedByRole,
      effectiveEndAt: input.effectiveEndAt ?? null,
      connectedSecondsObserved: boundedConnectedSeconds,
      billableSeconds: settlement.billableSeconds,
      callerChargeMinor: charge.toString(),
      callerCurrencyCode: row.currency_code,
      listenerEarningMinor: earning.toString(),
      listenerCurrencyCode: row.listener_currency_code,
      holdReleasedMinor: unusedHold.toString(),
      platformContributionPendingFx: !sameCurrency,
    })]);

    await client.query('DELETE FROM app.internet_voice_signals WHERE call_session_id=$1', [row.id]);

    return {
      callId: row.id,
      status: finalStatus as 'completed' | 'safety_terminated',
      billableSeconds: settlement.billableSeconds,
      callerChargeMinor: charge.toString(),
      listenerEarningMinor: earning.toString(),
      idempotent: false,
    };
  });

  if (!settlement.idempotent) {
    // Outside the settlement transaction, same external-I/O-after-commit
    // pattern as the recording start call site. Idempotent on the provider
    // side and on our own state machine, so a retry of an already-terminal
    // call intentionally skips this rather than re-issuing a stop.
    await stopRecordingForCall(settlement.callId).catch(() => undefined);
  }

  return settlement;
}
