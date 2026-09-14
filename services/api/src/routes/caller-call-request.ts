import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { computeCallAuthorization } from '../domain/call-authorization.ts';
import { requireWave1SessionCapSeconds } from '../domain/session-policy.ts';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext, type SqlRunner } from '../lib/caller-market.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { requireCurrentCallerAgeAssertion } from './caller.ts';
import { INTERNAL_OWNER_TEST_LISTENER_ID, isInternalOwnerTestCaller } from '../lib/internal-owner-test.ts';
import { currentRecordingPolicy } from '../lib/recording-config.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];

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

function parseUuid(value: unknown, code: string, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const id = String(value ?? '').trim();
  if (!UUID_RE.test(id)) throw new HttpError(400, code);
  return id;
}

function parseMaxSeconds(value: unknown): number {
  const parsed = value === undefined || value === null || value === '' ? 600 : Number(value);
  try { return requireWave1SessionCapSeconds(parsed); }
  catch { throw new HttpError(400, 'invalid_session_cap'); }
}

function snapshot(row: {
  id: string;
  status: string;
  listener_user_id: string | null;
  currency_code: string;
  authorized_minor: string;
  max_billable_seconds: number | null;
  pricing_plan_id: string | null;
  caller_market_id: string;
}) {
  return {
    callId: row.id,
    status: row.status,
    listenerId: row.listener_user_id,
    currencyCode: row.currency_code,
    authorizedMinor: row.authorized_minor,
    maxBillableSeconds: row.max_billable_seconds,
    pricingPlanId: row.pricing_plan_id,
    callerMarketId: row.caller_market_id,
  };
}

function resolveRecordingModeForNewCall(): 'all_with_consent' | 'none' {
  let policy: ReturnType<typeof currentRecordingPolicy>;
  try {
    policy = currentRecordingPolicy();
  } catch {
    // Fail closed: a recording-required environment with missing/invalid
    // recording configuration must refuse to create new calls rather than
    // silently create one that can never become billable.
    throw new HttpError(503, 'call_recording_not_configured');
  }
  return policy.required ? 'all_with_consent' : 'none';
}

export async function requestCallerCall(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await requireCurrentCallerAgeAssertion(userId);
  const recordingMode = resolveRecordingModeForNewCall();
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
  const listenerId = parseUuid(body.listenerId, 'invalid_listener', true);
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
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:caller_market:' || $1::text, 0))",
      [userId],
    );

    const existing = await client.query<{
      id: string;
      status: string;
      listener_user_id: string | null;
      currency_code: string;
      authorized_minor: string;
      max_billable_seconds: number | null;
      pricing_plan_id: string | null;
      caller_market_id: string;
    }>(`
      SELECT id::text, status::text, listener_user_id::text, currency_code,
             authorized_minor::text, max_billable_seconds, pricing_plan_id::text,
             caller_market_id::text
      FROM app.call_sessions
      WHERE caller_user_id=$1 AND client_request_id=$2
      FOR UPDATE
    `, [userId, clientRequestId]);
    if (existing.rows[0]) return { ...snapshot(existing.rows[0]), idempotent: true };

    const active = await client.query(`
      SELECT 1
      FROM app.call_sessions
      WHERE caller_user_id=$1 AND status::text = ANY($2::text[])
      LIMIT 1
      FOR UPDATE
    `, [userId, ACTIVE_CALL_STATUSES]);
    if (active.rows[0]) throw new HttpError(409, 'caller_call_already_active');

    const context = await resolveCallerMarketContext(userId, client as unknown as SqlRunner);
    const quote = await client.query<{
      caller_market_id: string;
      pricing_plan_id: string;
      max_billable_seconds: number;
      authorized_minor: string;
      currency_code: string;
    }>(`
      SELECT caller_market_id::text, pricing_plan_id::text, max_billable_seconds,
             authorized_minor::text, currency_code
      FROM app.caller_quote_bindings
      WHERE caller_user_id=$1
        AND quote_target='instant'
        AND max_billable_seconds=$2
        AND expires_at>now()
      FOR UPDATE
    `, [userId, maxSeconds]);
    const quoted = quote.rows[0];
    if (!quoted) throw new HttpError(409, 'quote_required');
    if (
      quoted.caller_market_id !== context.market.id
      || quoted.pricing_plan_id !== context.pricing.id
      || quoted.currency_code !== context.pricing.currencyCode
    ) {
      throw new HttpError(409, 'quote_stale');
    }

    const language = await client.query<{ id: string }>(`
      SELECT id::text
      FROM app.languages
      WHERE code=$1 AND is_active=true
      LIMIT 1
    `, [languageCode]);
    const languageId = language.rows[0]?.id;
    if (!languageId) throw new HttpError(400, 'unknown_language');

    const callerProfile = await client.query<{ declared_gender: string | null }>(
      'SELECT declared_gender::text FROM app.caller_profiles WHERE user_id=$1',
      [userId],
    );
    const callerGender = callerProfile.rows[0]?.declared_gender ?? null;

    const candidate = await client.query<{ listener_user_id: string }>(`
      SELECT lp.user_id::text listener_user_id
      FROM app.listener_profiles lp
      JOIN app.users su ON su.id=lp.user_id AND su.status='active'
      JOIN app.listener_service_profiles sp
        ON sp.listener_user_id=lp.user_id AND sp.service_id=$2
        AND (sp.is_public=true OR ($10::boolean AND lp.user_id=$11::uuid))
      JOIN app.listener_applications la
        ON la.user_id=lp.user_id AND la.service_id=$2
        AND (la.status IN ('approved','active') OR ($10::boolean AND lp.user_id=$11::uuid))
      JOIN app.listener_languages ll
        ON ll.listener_user_id=lp.user_id AND ll.language_id=$4
      JOIN app.listener_presence pres
        ON pres.listener_user_id=lp.user_id
        AND pres.product_id=$1 AND pres.service_id=$2 AND pres.market_id=$3
        AND pres.status='online'
        AND pres.last_heartbeat_at > now() - interval '90 seconds'
      WHERE (lp.is_verified=true OR ($10::boolean AND lp.user_id=$11::uuid))
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
      context.product.id,
      context.service.id,
      context.marketplace.id,
      languageId,
      listenerId,
      listenerGender,
      callerGender,
      userId,
      ACTIVE_CALL_STATUSES,
      isInternalOwnerTestCaller(userId),
      INTERNAL_OWNER_TEST_LISTENER_ID,
    ]);
    const selectedListenerId = candidate.rows[0]?.listener_user_id;
    if (!selectedListenerId) throw new HttpError(409, 'no_listener_available');

    await client.query(`
      INSERT INTO app.wallets(user_id, currency_code)
      VALUES ($1,$2)
      ON CONFLICT (user_id, currency_code) DO NOTHING
    `, [userId, context.pricing.currencyCode]);
    const wallet = await client.query<{ id: string; balance_minor: string; reserved_minor: string }>(`
      SELECT id::text, balance_minor::text, reserved_minor::text
      FROM app.wallets
      WHERE user_id=$1 AND currency_code=$2
      FOR UPDATE
    `, [userId, context.pricing.currencyCode]);
    const walletRow = wallet.rows[0];
    if (!walletRow) throw new HttpError(503, 'wallet_unavailable');

    const authorization = computeCallAuthorization({
      balanceMinor: BigInt(walletRow.balance_minor),
      reservedMinor: BigInt(walletRow.reserved_minor),
      callerRatePerMinuteMinor: context.pricing.callerRatePerMinuteMinor,
      billingIncrementSeconds: context.pricing.billingIncrementSeconds,
      requestedMaxSeconds: maxSeconds,
    });
    if (!authorization) throw new HttpError(402, 'insufficient_balance');
    if (
      authorization.maxBillableSeconds !== quoted.max_billable_seconds
      || authorization.authorizedMinor !== BigInt(quoted.authorized_minor)
    ) {
      throw new HttpError(409, 'quote_stale');
    }

    const inserted = await client.query<{
      id: string;
      status: string;
      listener_user_id: string | null;
      currency_code: string;
      authorized_minor: string;
      max_billable_seconds: number | null;
      pricing_plan_id: string | null;
      caller_market_id: string;
    }>(`
      INSERT INTO app.call_sessions(
        product_id, service_id, market_id, caller_market_id,
        caller_user_id, listener_user_id, client_request_id, status,
        requested_listener_gender, requested_language_id, caller_mood, topic_code,
        pricing_plan_id, currency_code, caller_rate_per_minute_minor,
        listener_rate_per_minute_minor, listener_currency_code,
        authorized_minor, max_billable_seconds, recording_mode
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'routing',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::app.recording_mode
      )
      RETURNING id::text, status::text, listener_user_id::text, currency_code,
                authorized_minor::text, max_billable_seconds, pricing_plan_id::text,
                caller_market_id::text
    `, [
      context.product.id,
      context.service.id,
      context.marketplace.id,
      context.market.id,
      userId,
      selectedListenerId,
      clientRequestId,
      listenerGender,
      languageId,
      mood,
      topicCode,
      context.pricing.id,
      context.pricing.currencyCode,
      context.pricing.callerRatePerMinuteMinor.toString(),
      context.listenerBase.ratePerMinuteMinor.toString(),
      context.listenerBase.currencyCode,
      authorization.authorizedMinor.toString(),
      authorization.maxBillableSeconds,
      recordingMode,
    ]);
    const row = inserted.rows[0];

    const walletUpdate = await client.query(`
      UPDATE app.wallets
      SET reserved_minor=reserved_minor+$2::bigint, version=version+1
      WHERE id=$1 AND balance_minor-reserved_minor >= $2::bigint
      RETURNING id
    `, [walletRow.id, authorization.authorizedMinor.toString()]);
    if (!walletUpdate.rowCount) throw new HttpError(409, 'wallet_reservation_conflict');

    await client.query('DELETE FROM app.caller_quote_bindings WHERE caller_user_id=$1', [userId]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'routing','api',$2::jsonb)
    `, [row.id, JSON.stringify({
      clientRequestId,
      callerMarketId: context.market.id,
      callerMarketCode: context.market.code,
      pricingPlanId: context.pricing.id,
      quoteBound: true,
      listenerBaseCurrencyCode: context.listenerBase.currencyCode,
      listenerBaseRatePerMinuteMinor: context.listenerBase.ratePerMinuteMinor.toString(),
    })]);

    return { ...snapshot(row), idempotent: false };
  });

  sendJson(res, call.idempotent ? 200 : 201, { ok: true, ...call });
}
