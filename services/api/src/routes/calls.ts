import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction, query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { computeCallAuthorization } from '../domain/call-authorization.ts';
import { getTelephonyProvider } from '../providers/telephony.ts';
import { requireCurrentCallerAgeAssertion } from './caller.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeCallStatuses = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];
const terminationEventReasons = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

function parseRequestedGender(value: unknown): 'female' | 'male' | 'any' {
  if (value === undefined || value === null || value === 'any') return 'any';
  if (value === 'female' || value === 'male') return value;
  throw new HttpError(400, 'invalid_gender');
}

function parseLanguage(value: unknown): string {
  const code = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,16}$/.test(code)) throw new HttpError(400, 'invalid_language');
  return code;
}

function parseListenerId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const id = String(value).trim();
  if (!UUID_RE.test(id)) throw new HttpError(400, 'invalid_listener');
  return id;
}

function parseMaxSeconds(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 86_400) throw new HttpError(400, 'invalid_max_seconds');
  return parsed;
}

function snapshotCall(row: {
  id: string;
  status: string;
  listener_user_id: string | null;
  currency_code: string;
  authorized_minor: string;
  max_billable_seconds: number | null;
  provider_bridge_id: string | null;
}) {
  return {
    callId: row.id,
    status: row.status,
    listenerId: row.listener_user_id,
    currencyCode: row.currency_code,
    authorizedMinor: row.authorized_minor,
    maxBillableSeconds: row.max_billable_seconds,
    telephonyReady: Boolean(row.provider_bridge_id),
  };
}

export async function requestCall(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await requireCurrentCallerAgeAssertion(userId);

  const body = await readJson<{
    clientRequestId?: unknown;
    listenerId?: unknown;
    listenerGender?: unknown;
    languageCode?: unknown;
    mood?: unknown;
    topicCode?: unknown;
    maxSeconds?: unknown;
  }>(req);
  const clientRequestId = requireString(body.clientRequestId, 'clientRequestId', 8, 100);
  const listenerId = parseListenerId(body.listenerId);
  const listenerGender = parseRequestedGender(body.listenerGender);
  const languageCode = parseLanguage(body.languageCode);
  const maxSeconds = parseMaxSeconds(body.maxSeconds);
  const moods = new Set(['sad', 'angry', 'overwhelmed', 'lonely', 'just_talk', 'other']);
  const mood = body.mood === undefined || body.mood === null ? null : String(body.mood);
  if (mood !== null && !moods.has(mood)) throw new HttpError(400, 'invalid_mood');
  const topicCode = typeof body.topicCode === 'string' && body.topicCode.trim()
    ? body.topicCode.trim().slice(0, 80)
    : null;

  const call = await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:caller_active:' || $1::text, 0))",
      [userId],
    );

    const existing = await client.query<{
      id: string; status: string; listener_user_id: string | null; currency_code: string;
      authorized_minor: string; max_billable_seconds: number | null; provider_bridge_id: string | null;
    }>(`
      SELECT id::text, status::text, listener_user_id::text, currency_code,
             authorized_minor::text, max_billable_seconds, provider_bridge_id
      FROM app.call_sessions
      WHERE caller_user_id=$1 AND client_request_id=$2
      FOR UPDATE
    `, [userId, clientRequestId]);
    if (existing.rows[0]) return { ...snapshotCall(existing.rows[0]), idempotent: true };

    const active = await client.query<{ id: string }>(`
      SELECT id::text
      FROM app.call_sessions
      WHERE caller_user_id=$1 AND status::text = ANY($2::text[])
      ORDER BY requested_at DESC
      LIMIT 1
      FOR UPDATE
    `, [userId, activeCallStatuses]);
    if (active.rows[0]) throw new HttpError(409, 'caller_call_already_active');

    const ctxResult = await client.query<{
      product_id: string; service_id: string; market_id: string; language_id: string;
      pricing_plan_id: string; currency_code: string; caller_rate: string; listener_rate: string;
      billing_increment_seconds: number;
    }>(`
      SELECT p.id::text product_id, s.id::text service_id, m.id::text market_id,
             l.id::text language_id, pp.id::text pricing_plan_id, pp.currency_code,
             pp.caller_rate_per_minute_minor::text caller_rate,
             pp.listener_rate_per_minute_minor::text listener_rate,
             pp.billing_increment_seconds
      FROM app.products p
      JOIN app.service_catalog s ON s.code='human_listening' AND s.status='active'
      JOIN app.markets m ON m.code='ir' AND m.is_active=true
      JOIN app.languages l ON l.code=$1 AND l.is_active=true
      JOIN app.pricing_plans pp
        ON pp.product_id=p.id AND pp.service_id=s.id AND pp.market_id=m.id AND pp.is_active=true
      WHERE p.code='yeki_hast'
      LIMIT 1
    `, [languageCode]);
    const ctx = ctxResult.rows[0];
    if (!ctx) throw new HttpError(503, 'call_market_unavailable');

    const callerProfile = await client.query<{ declared_gender: string | null }>(
      'SELECT declared_gender::text FROM app.caller_profiles WHERE user_id=$1', [userId],
    );
    const callerGender = callerProfile.rows[0]?.declared_gender ?? null;

    const candidate = await client.query<{ listener_user_id: string }>(`
      SELECT lp.user_id::text listener_user_id
      FROM app.listener_profiles lp
      JOIN app.listener_service_profiles sp
        ON sp.listener_user_id=lp.user_id AND sp.service_id=$2 AND sp.is_public=true
      JOIN app.listener_applications la
        ON la.user_id=lp.user_id AND la.service_id=$2 AND la.status IN ('approved','active')
      JOIN app.listener_languages ll
        ON ll.listener_user_id=lp.user_id AND ll.language_id=$4
      JOIN app.listener_presence pres
        ON pres.listener_user_id=lp.user_id
        AND pres.product_id=$1 AND pres.service_id=$2 AND pres.market_id=$3
        AND pres.status='online'
        AND pres.last_heartbeat_at > now() - interval '90 seconds'
      WHERE lp.is_verified=true
        AND lp.user_id<>$8::uuid
        AND ($5::uuid IS NULL OR lp.user_id=$5::uuid)
        AND ($6::text='any' OR lp.gender::text=$6)
        AND ($7::text IS NULL OR ($7='male' AND pres.accepts_male=true) OR ($7='female' AND pres.accepts_female=true))
        AND NOT EXISTS (
          SELECT 1 FROM app.blocks b
          WHERE ((b.blocker_user_id=$8 AND b.blocked_user_id=lp.user_id)
              OR (b.blocker_user_id=lp.user_id AND b.blocked_user_id=$8))
            AND (b.expires_at IS NULL OR b.expires_at>now())
        )
        AND NOT EXISTS (
          SELECT 1 FROM app.call_sessions busy
          WHERE busy.listener_user_id=lp.user_id AND busy.status::text = ANY($9::text[])
        )
      ORDER BY sp.rating_average DESC NULLS LAST, lp.reliability_score DESC, pres.online_since
      FOR UPDATE OF pres SKIP LOCKED
      LIMIT 1
    `, [
      ctx.product_id, ctx.service_id, ctx.market_id, ctx.language_id,
      listenerId, listenerGender, callerGender, userId, activeCallStatuses,
    ]);
    const selectedListenerId = candidate.rows[0]?.listener_user_id;
    if (!selectedListenerId) throw new HttpError(409, 'no_listener_available');

    await client.query(`
      INSERT INTO app.wallets(user_id, currency_code)
      VALUES ($1,$2)
      ON CONFLICT (user_id, currency_code) DO NOTHING
    `, [userId, ctx.currency_code]);
    const wallet = await client.query<{ id: string; balance_minor: string; reserved_minor: string }>(`
      SELECT id::text, balance_minor::text, reserved_minor::text
      FROM app.wallets
      WHERE user_id=$1 AND currency_code=$2
      FOR UPDATE
    `, [userId, ctx.currency_code]);
    const walletRow = wallet.rows[0];
    if (!walletRow) throw new HttpError(503, 'wallet_unavailable');

    const authorization = computeCallAuthorization({
      balanceMinor: BigInt(walletRow.balance_minor),
      reservedMinor: BigInt(walletRow.reserved_minor),
      callerRatePerMinuteMinor: BigInt(ctx.caller_rate),
      billingIncrementSeconds: ctx.billing_increment_seconds,
      requestedMaxSeconds: maxSeconds,
    });
    if (!authorization) throw new HttpError(402, 'insufficient_balance');

    const inserted = await client.query<{
      id: string; status: string; listener_user_id: string | null; currency_code: string;
      authorized_minor: string; max_billable_seconds: number | null; provider_bridge_id: string | null;
    }>(`
      INSERT INTO app.call_sessions(
        product_id, service_id, market_id, caller_user_id, listener_user_id,
        client_request_id, status, requested_listener_gender, requested_language_id,
        caller_mood, topic_code, pricing_plan_id, currency_code,
        caller_rate_per_minute_minor, listener_rate_per_minute_minor,
        authorized_minor, max_billable_seconds
      )
      VALUES ($1,$2,$3,$4,$5,$6,'routing',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id::text, status::text, listener_user_id::text, currency_code,
                authorized_minor::text, max_billable_seconds, provider_bridge_id
    `, [
      ctx.product_id, ctx.service_id, ctx.market_id, userId, selectedListenerId,
      clientRequestId, listenerGender, ctx.language_id, mood, topicCode, ctx.pricing_plan_id,
      ctx.currency_code, ctx.caller_rate, ctx.listener_rate,
      authorization.authorizedMinor.toString(), authorization.maxBillableSeconds,
    ]);
    const row = inserted.rows[0];

    const walletUpdate = await client.query(`
      UPDATE app.wallets
      SET reserved_minor=reserved_minor+$2::bigint, version=version+1
      WHERE id=$1 AND balance_minor-reserved_minor >= $2::bigint
      RETURNING id
    `, [walletRow.id, authorization.authorizedMinor.toString()]);
    if (!walletUpdate.rowCount) throw new HttpError(409, 'wallet_reservation_conflict');

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'routing','api',jsonb_build_object('clientRequestId',$2))
    `, [row.id, clientRequestId]);

    return { ...snapshotCall(row), idempotent: false };
  });

  sendJson(res, 201, { ok: true, ...call });
}

export async function getActiveCall(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await query<{
    id: string; status: string; listener_user_id: string | null; currency_code: string;
    authorized_minor: string; max_billable_seconds: number | null; requested_at: string;
    connected_at: string | null; ended_at: string | null; billable_seconds: number;
    caller_charge_minor: string; provider_bridge_id: string | null; termination_in_progress: boolean;
  }>(`
    SELECT cs.id::text, cs.status::text, cs.listener_user_id::text, cs.currency_code,
           cs.authorized_minor::text, cs.max_billable_seconds, cs.requested_at::text,
           cs.connected_at::text, cs.ended_at::text, cs.billable_seconds, cs.caller_charge_minor::text,
           cs.provider_bridge_id,
           EXISTS (
             SELECT 1
             FROM app.call_events ce
             WHERE ce.call_session_id=cs.id
               AND ce.metadata->>'reason' = ANY($3::text[])
           ) AS termination_in_progress
    FROM app.call_sessions cs
    WHERE cs.caller_user_id=$1 AND cs.status::text = ANY($2::text[])
    ORDER BY cs.requested_at DESC
    LIMIT 2
  `, [userId, activeCallStatuses, terminationEventReasons]);
  if (result.rows.length > 1) throw new HttpError(409, 'caller_active_call_conflict');
  const row = result.rows[0];
  if (!row) {
    sendJson(res, 200, { activeCall: null });
    return;
  }
  sendJson(res, 200, {
    activeCall: {
      callId: row.id,
      status: row.status,
      listenerId: row.listener_user_id,
      currencyCode: row.currency_code,
      authorizedMinor: row.authorized_minor,
      maxBillableSeconds: row.max_billable_seconds,
      telephonyReady: Boolean(row.provider_bridge_id),
      terminationInProgress: row.termination_in_progress,
      requestedAt: row.requested_at,
      connectedAt: row.connected_at,
      endedAt: row.ended_at,
      billableSeconds: row.billable_seconds,
      callerChargeMinor: row.caller_charge_minor,
    },
  });
}

export async function getCall(req: IncomingMessage, res: ServerResponse, callId: string) {
  const { userId } = await requireAuth(req);
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');
  const result = await query<{
    id: string; status: string; listener_user_id: string | null; currency_code: string;
    authorized_minor: string; max_billable_seconds: number | null; requested_at: string;
    connected_at: string | null; ended_at: string | null; billable_seconds: number;
    caller_charge_minor: string; provider_bridge_id: string | null; termination_in_progress: boolean;
  }>(`
    SELECT cs.id::text, cs.status::text, cs.listener_user_id::text, cs.currency_code,
           cs.authorized_minor::text, cs.max_billable_seconds, cs.requested_at::text,
           cs.connected_at::text, cs.ended_at::text, cs.billable_seconds, cs.caller_charge_minor::text,
           cs.provider_bridge_id,
           EXISTS (
             SELECT 1
             FROM app.call_events ce
             WHERE ce.call_session_id=cs.id
               AND ce.metadata->>'reason' = ANY($3::text[])
           ) AS termination_in_progress
    FROM app.call_sessions cs
    WHERE cs.id=$1 AND cs.caller_user_id=$2
  `, [callId, userId, terminationEventReasons]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'call_not_found');
  sendJson(res, 200, {
    callId: row.id,
    status: row.status,
    listenerId: row.listener_user_id,
    currencyCode: row.currency_code,
    authorizedMinor: row.authorized_minor,
    maxBillableSeconds: row.max_billable_seconds,
    telephonyReady: Boolean(row.provider_bridge_id),
    terminationInProgress: row.termination_in_progress,
    requestedAt: row.requested_at,
    connectedAt: row.connected_at,
    endedAt: row.ended_at,
    billableSeconds: row.billable_seconds,
    callerChargeMinor: row.caller_charge_minor,
  });
}

export async function cancelCall(req: IncomingMessage, res: ServerResponse, callId: string) {
  const { userId } = await requireAuth(req);
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');

  const preparation = await withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      status: string;
      currency_code: string;
      authorized_minor: string;
      provider_bridge_id: string | null;
    }>(`
      SELECT id::text, status::text, currency_code, authorized_minor::text, provider_bridge_id
      FROM app.call_sessions
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [callId, userId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    if (row.status === 'cancelled') {
      return { kind: 'already_cancelled' as const };
    }
    if (!['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener'].includes(row.status)) {
      throw new HttpError(409, 'call_cannot_be_cancelled');
    }
    if (row.status === 'calling_caller' && !row.provider_bridge_id) {
      throw new HttpError(409, 'telephony_dispatch_uncertain');
    }
    if ((row.status === 'caller_answered' || row.status === 'calling_listener') && !row.provider_bridge_id) {
      throw new HttpError(409, 'call_telephony_invariant');
    }

    if (!row.provider_bridge_id) {
      return {
        kind: 'local_only' as const,
        providerBridgeId: null,
      };
    }

    const competingTermination = await client.query(`
      SELECT 1
      FROM app.call_events
      WHERE call_session_id=$1
        AND metadata->>'reason' = ANY($2::text[])
      LIMIT 1
    `, [callId, [
      'safety_termination_started',
      'safety_termination_result_uncertain',
      'safety_termination_confirmed',
    ]]);
    if (competingTermination.rowCount) {
      throw new HttpError(409, 'call_termination_in_progress');
    }

    const prior = await client.query<{ reason: string }>(`
      SELECT metadata->>'reason' AS reason
      FROM app.call_events
      WHERE call_session_id=$1
        AND metadata->>'reason' = ANY($2::text[])
      ORDER BY created_at DESC
    `, [callId, [
      'cancel_termination_started',
      'cancel_termination_result_uncertain',
      'cancel_termination_confirmed',
    ]]);
    const reasons = new Set(prior.rows.map((event) => event.reason));

    if (reasons.has('cancel_termination_confirmed')) {
      return {
        kind: 'provider_confirmed' as const,
        providerBridgeId: row.provider_bridge_id,
      };
    }
    if (reasons.has('cancel_termination_result_uncertain') || reasons.has('cancel_termination_started')) {
      throw new HttpError(409, 'telephony_termination_reconcile_required');
    }

    let telephony: ReturnType<typeof getTelephonyProvider>;
    try {
      telephony = getTelephonyProvider();
    } catch {
      throw new HttpError(503, 'telephony_not_configured');
    }

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,$2::app.call_status,'api',jsonb_build_object('reason','cancel_termination_started'))
    `, [callId, row.status]);

    return {
      kind: 'provider_submit' as const,
      providerBridgeId: row.provider_bridge_id,
      telephony,
    };
  });

  if (preparation.kind === 'already_cancelled') {
    sendJson(res, 200, { ok: true, callId, status: 'cancelled', idempotent: true });
    return;
  }

  if (preparation.kind === 'provider_submit') {
    try {
      await preparation.telephony.terminateCall(preparation.providerBridgeId, 'caller_cancelled');
    } catch {
      try {
        await query(`
          INSERT INTO app.call_events(call_session_id, status, source, metadata)
          SELECT id, status, 'telephony', jsonb_build_object('reason','cancel_termination_result_uncertain')
          FROM app.call_sessions
          WHERE id=$1
        `, [callId]);
      } catch {
        console.error('cancel_termination_uncertain_event_failed', { callId });
      }
      throw new HttpError(502, 'telephony_termination_pending');
    }

    try {
      await query(`
        INSERT INTO app.call_events(call_session_id, status, source, metadata)
        SELECT id, status, 'telephony', jsonb_build_object('reason','cancel_termination_confirmed')
        FROM app.call_sessions
        WHERE id=$1
      `, [callId]);
    } catch {
      console.error('cancel_termination_confirmed_event_failed', { callId });
      throw new HttpError(503, 'telephony_termination_reconcile_required');
    }
  }

  const expectedProviderBridgeId = preparation.providerBridgeId;
  const finalized = await withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      status: string;
      currency_code: string;
      authorized_minor: string;
      provider_bridge_id: string | null;
    }>(`
      SELECT id::text, status::text, currency_code, authorized_minor::text, provider_bridge_id
      FROM app.call_sessions
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [callId, userId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    if (row.status === 'cancelled') {
      return { status: 'cancelled' as const, idempotent: true };
    }
    if (!['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener'].includes(row.status)) {
      throw new HttpError(409, 'call_cannot_be_cancelled');
    }

    if (expectedProviderBridgeId) {
      if (row.provider_bridge_id !== expectedProviderBridgeId) {
        throw new HttpError(409, 'call_telephony_invariant');
      }
      const confirmed = await client.query(`
        SELECT 1
        FROM app.call_events
        WHERE call_session_id=$1
          AND metadata->>'reason'='cancel_termination_confirmed'
        LIMIT 1
      `, [callId]);
      if (!confirmed.rowCount) {
        throw new HttpError(409, 'telephony_termination_reconcile_required');
      }
    } else if (row.provider_bridge_id) {
      throw new HttpError(409, 'call_telephony_invariant');
    }

    const authorized = BigInt(row.authorized_minor);
    if (authorized > 0n) {
      const release = await client.query(`
        UPDATE app.wallets
        SET reserved_minor=reserved_minor-$3::bigint, version=version+1
        WHERE user_id=$1 AND currency_code=$2 AND reserved_minor >= $3::bigint
        RETURNING id
      `, [userId, row.currency_code, authorized.toString()]);
      if (!release.rowCount) throw new HttpError(409, 'wallet_release_conflict');
    }

    await client.query(`
      UPDATE app.call_sessions
      SET status='cancelled', ended_at=COALESCE(ended_at, now()), ended_reason='caller_cancelled'
      WHERE id=$1
    `, [callId]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source)
      VALUES ($1,'cancelled','caller')
    `, [callId]);
    return { status: 'cancelled' as const, idempotent: false };
  });

  sendJson(res, 200, { ok: true, callId, status: finalized.status, idempotent: finalized.idempotent });
}
