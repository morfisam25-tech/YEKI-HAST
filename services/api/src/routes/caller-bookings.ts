import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { computeCallAuthorization } from '../domain/call-authorization.ts';
import { requireWave1SessionCapSeconds } from '../domain/session-policy.ts';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext, type SqlRunner } from '../lib/caller-market.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { requireCurrentCallerAgeAssertion } from './caller.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];

type QuoteBinding = {
  caller_market_id: string;
  pricing_plan_id: string;
  quote_target: string;
  max_billable_seconds: number;
  booking_id: string | null;
  authorized_minor: string;
  currency_code: string;
};

function requireUuid(value: unknown, code: string): string {
  const id = String(value ?? '').trim();
  if (!UUID_RE.test(id)) throw new HttpError(400, code);
  return id;
}

function parseInstant(value: unknown, code: string): Date {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, code);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new HttpError(400, code);
  return new Date(timestamp);
}

function parseLanguage(value: unknown): string {
  const code = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,16}$/.test(code)) throw new HttpError(400, 'invalid_language');
  return code;
}

function parseMaxSeconds(value: unknown): number {
  try { return requireWave1SessionCapSeconds(Number(value)); }
  catch { throw new HttpError(400, 'invalid_session_cap'); }
}

async function lockedQuoteBinding(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  userId: string,
  target: 'booking' | 'booking_start',
  maxSeconds: number,
  bookingId: string | null,
): Promise<QuoteBinding> {
  const result = await client.query<QuoteBinding>(`
    SELECT caller_market_id::text, pricing_plan_id::text, quote_target,
           max_billable_seconds, booking_id::text, authorized_minor::text, currency_code
    FROM app.caller_quote_bindings
    WHERE caller_user_id=$1
      AND quote_target=$2
      AND max_billable_seconds=$3
      AND ($4::uuid IS NULL OR booking_id=$4::uuid)
      AND expires_at>now()
    FOR UPDATE
  `, [userId, target, maxSeconds, bookingId]);
  const binding = result.rows[0];
  if (!binding) throw new HttpError(409, 'quote_required');
  return binding;
}

function assertBindingMatchesContext(
  binding: QuoteBinding,
  context: Awaited<ReturnType<typeof resolveCallerMarketContext>>,
) {
  if (
    binding.caller_market_id !== context.market.id
    || binding.pricing_plan_id !== context.pricing.id
    || binding.currency_code !== context.pricing.currencyCode
  ) {
    throw new HttpError(409, 'quote_stale');
  }
}

export async function createCallerBooking(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await requireCurrentCallerAgeAssertion(userId);
  const body = await readJson<{
    clientRequestId?: unknown;
    availabilityId?: unknown;
    languageCode?: unknown;
    scheduledAt?: unknown;
    maxSeconds?: unknown;
  }>(req);
  const clientRequestId = requireString(body.clientRequestId, 'clientRequestId', 8, 100);
  const availabilityId = requireUuid(body.availabilityId, 'invalid_availability');
  const languageCode = parseLanguage(body.languageCode);
  const scheduledAt = parseInstant(body.scheduledAt, 'invalid_scheduled_at');
  const maxSeconds = parseMaxSeconds(body.maxSeconds);
  if (scheduledAt.getTime() <= Date.now()) throw new HttpError(400, 'booking_must_be_future');
  const scheduledEnd = new Date(scheduledAt.getTime() + maxSeconds * 1000);

  const booking = await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:booking_caller:' || $1::text, 0))",
      [userId],
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:caller_market:' || $1::text, 0))",
      [userId],
    );

    const existing = await client.query<{
      id: string;
      listener_user_id: string;
      scheduled_at: string;
      max_billable_seconds: number;
      status: string;
      caller_market_id: string;
    }>(`
      SELECT id::text, listener_user_id::text, scheduled_at::text,
             max_billable_seconds, status, caller_market_id::text
      FROM app.call_reservations
      WHERE caller_user_id=$1 AND client_request_id=$2
      FOR UPDATE
    `, [userId, clientRequestId]);
    if (existing.rows[0]) return { ...existing.rows[0], idempotent: true };

    const context = await resolveCallerMarketContext(userId, client as unknown as SqlRunner);
    const binding = await lockedQuoteBinding(client, userId, 'booking', maxSeconds, null);
    assertBindingMatchesContext(binding, context);

    const caller = await client.query<{ declared_gender: string | null }>(
      'SELECT declared_gender::text FROM app.caller_profiles WHERE user_id=$1',
      [userId],
    );
    const callerGender = caller.rows[0]?.declared_gender ?? null;

    const available = await client.query<{
      listener_user_id: string;
      product_id: string;
      service_id: string;
      market_id: string;
    }>(`
      SELECT a.listener_user_id::text, a.product_id::text, a.service_id::text, a.market_id::text
      FROM app.listener_availability a
      JOIN app.listener_profiles lp ON lp.user_id=a.listener_user_id AND lp.is_verified=true
      JOIN app.listener_applications la
        ON la.user_id=a.listener_user_id AND la.service_id=a.service_id AND la.status IN ('approved','active')
      WHERE a.id=$1
        AND a.product_id=$6::uuid
        AND a.service_id=$7::uuid
        AND a.market_id=$8::uuid
        AND a.status='open'
        AND a.listener_user_id<>$2::uuid
        AND a.starts_at <= $3::timestamptz
        AND a.ends_at >= $4::timestamptz
        AND ($5::text IS NULL
          OR ($5='male' AND a.accepts_male=true)
          OR ($5='female' AND a.accepts_female=true))
        AND NOT EXISTS (
          SELECT 1 FROM app.blocks b
          WHERE ((b.blocker_user_id=$2 AND b.blocked_user_id=a.listener_user_id)
              OR (b.blocker_user_id=a.listener_user_id AND b.blocked_user_id=$2))
            AND (b.expires_at IS NULL OR b.expires_at>now())
        )
      FOR UPDATE OF a
    `, [
      availabilityId,
      userId,
      scheduledAt.toISOString(),
      scheduledEnd.toISOString(),
      callerGender,
      context.product.id,
      context.service.id,
      context.marketplace.id,
    ]);
    const slot = available.rows[0];
    if (!slot) throw new HttpError(409, 'availability_not_bookable');

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:booking_listener:' || $1::text, 0))",
      [slot.listener_user_id],
    );

    const language = await client.query<{ id: string }>(`
      SELECT l.id::text
      FROM app.languages l
      JOIN app.listener_languages ll ON ll.language_id=l.id AND ll.listener_user_id=$2
      WHERE l.code=$1 AND l.is_active=true
      LIMIT 1
    `, [languageCode, slot.listener_user_id]);
    const languageId = language.rows[0]?.id;
    if (!languageId) throw new HttpError(409, 'listener_language_unavailable');

    const overlap = await client.query(`
      SELECT 1
      FROM app.call_reservations
      WHERE status IN ('booked','initiated')
        AND (listener_user_id=$1::uuid OR caller_user_id=$2::uuid)
        AND scheduled_at < $4::timestamptz
        AND scheduled_at + make_interval(secs => max_billable_seconds) > $3::timestamptz
      LIMIT 1
      FOR UPDATE
    `, [slot.listener_user_id, userId, scheduledAt.toISOString(), scheduledEnd.toISOString()]);
    if (overlap.rows[0]) throw new HttpError(409, 'booking_time_conflict');

    const inserted = await client.query<{
      id: string;
      listener_user_id: string;
      scheduled_at: string;
      max_billable_seconds: number;
      status: string;
      caller_market_id: string;
    }>(`
      INSERT INTO app.call_reservations(
        product_id, service_id, market_id, caller_market_id, availability_id,
        caller_user_id, listener_user_id, language_id, client_request_id,
        scheduled_at, max_billable_seconds
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id::text, listener_user_id::text, scheduled_at::text,
                max_billable_seconds, status, caller_market_id::text
    `, [
      slot.product_id,
      slot.service_id,
      slot.market_id,
      context.market.id,
      availabilityId,
      userId,
      slot.listener_user_id,
      languageId,
      clientRequestId,
      scheduledAt.toISOString(),
      maxSeconds,
    ]);
    await client.query('DELETE FROM app.caller_quote_bindings WHERE caller_user_id=$1', [userId]);
    return { ...inserted.rows[0], idempotent: false };
  });

  sendJson(res, booking.idempotent ? 200 : 201, {
    ok: true,
    booking: {
      id: booking.id,
      listenerId: booking.listener_user_id,
      scheduledAt: booking.scheduled_at,
      maxBillableSeconds: booking.max_billable_seconds,
      status: booking.status,
      callerMarketId: booking.caller_market_id,
      idempotent: booking.idempotent,
    },
  });
}

export async function startCallerBooking(req: IncomingMessage, res: ServerResponse, bookingId: string) {
  const { userId } = await requireAuth(req);
  await requireCurrentCallerAgeAssertion(userId);
  if (!UUID_RE.test(bookingId)) throw new HttpError(400, 'invalid_booking');
  await readJson<Record<string, never>>(req);

  const call = await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:booking_caller:' || $1::text, 0))",
      [userId],
    );

    const result = await client.query<{
      id: string;
      status: string;
      product_id: string;
      service_id: string;
      market_id: string;
      caller_market_id: string;
      listener_user_id: string;
      language_id: string;
      scheduled_at: string;
      max_billable_seconds: number;
      call_session_id: string | null;
    }>(`
      SELECT id::text, status, product_id::text, service_id::text, market_id::text,
             caller_market_id::text, listener_user_id::text, language_id::text,
             scheduled_at::text, max_billable_seconds, call_session_id::text
      FROM app.call_reservations
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [bookingId, userId]);
    const booking = result.rows[0];
    if (!booking) throw new HttpError(404, 'booking_not_found');

    if (booking.status === 'initiated' && booking.call_session_id) {
      const existing = await client.query<{
        id: string;
        status: string;
        listener_user_id: string;
        currency_code: string;
        authorized_minor: string;
        max_billable_seconds: number;
        pricing_plan_id: string;
        caller_market_id: string;
      }>(`
        SELECT id::text, status::text, listener_user_id::text, currency_code,
               authorized_minor::text, max_billable_seconds, pricing_plan_id::text,
               caller_market_id::text
        FROM app.call_sessions
        WHERE id=$1 AND caller_user_id=$2
      `, [booking.call_session_id, userId]);
      const row = existing.rows[0];
      if (!row) throw new HttpError(409, 'booking_call_missing');
      return {
        kind: 'call' as const,
        callId: row.id,
        status: row.status,
        listenerId: row.listener_user_id,
        currencyCode: row.currency_code,
        authorizedMinor: row.authorized_minor,
        maxBillableSeconds: row.max_billable_seconds,
        pricingPlanId: row.pricing_plan_id,
        callerMarketId: row.caller_market_id,
        idempotent: true,
      };
    }
    if (booking.status !== 'booked') throw new HttpError(409, 'booking_not_startable');

    const scheduledAt = Date.parse(booking.scheduled_at);
    const now = Date.now();
    if (now < scheduledAt) throw new HttpError(409, 'booking_not_due');
    if (now >= scheduledAt + booking.max_billable_seconds * 1000) {
      await client.query(
        "UPDATE app.call_reservations SET status='missed', updated_at=now() WHERE id=$1 AND status='booked'",
        [bookingId],
      );
      return { kind: 'missed' as const };
    }

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:booking_listener:' || $1::text, 0))",
      [booking.listener_user_id],
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:caller_market:' || $1::text, 0))",
      [userId],
    );

    const context = await resolveCallerMarketContext(userId, client as unknown as SqlRunner);
    if (booking.caller_market_id !== context.market.id) throw new HttpError(409, 'booking_market_changed');
    if (
      booking.product_id !== context.product.id
      || booking.service_id !== context.service.id
      || booking.market_id !== context.marketplace.id
    ) {
      throw new HttpError(409, 'booking_context_changed');
    }
    const binding = await lockedQuoteBinding(
      client,
      userId,
      'booking_start',
      booking.max_billable_seconds,
      booking.id,
    );
    assertBindingMatchesContext(binding, context);

    const active = await client.query(`
      SELECT 1
      FROM app.call_sessions
      WHERE status::text = ANY($3::text[])
        AND (caller_user_id=$1::uuid OR listener_user_id=$2::uuid)
      LIMIT 1
      FOR UPDATE
    `, [userId, booking.listener_user_id, ACTIVE_CALL_STATUSES]);
    if (active.rows[0]) throw new HttpError(409, 'booking_party_busy');

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
      requestedMaxSeconds: booking.max_billable_seconds,
    });
    if (!authorization) throw new HttpError(402, 'insufficient_balance');
    if (
      authorization.maxBillableSeconds !== binding.max_billable_seconds
      || authorization.authorizedMinor !== BigInt(binding.authorized_minor)
    ) {
      throw new HttpError(409, 'quote_stale');
    }

    const inserted = await client.query<{
      id: string;
      status: string;
      listener_user_id: string;
      currency_code: string;
      authorized_minor: string;
      max_billable_seconds: number;
      pricing_plan_id: string;
      caller_market_id: string;
    }>(`
      INSERT INTO app.call_sessions(
        product_id, service_id, market_id, caller_market_id,
        caller_user_id, listener_user_id, client_request_id, status,
        requested_listener_gender, requested_language_id,
        pricing_plan_id, currency_code, caller_rate_per_minute_minor,
        listener_rate_per_minute_minor, listener_currency_code,
        authorized_minor, max_billable_seconds
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'routing','any',$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id::text, status::text, listener_user_id::text, currency_code,
                authorized_minor::text, max_billable_seconds, pricing_plan_id::text,
                caller_market_id::text
    `, [
      booking.product_id,
      booking.service_id,
      booking.market_id,
      booking.caller_market_id,
      userId,
      booking.listener_user_id,
      `booking:${booking.id}`,
      booking.language_id,
      context.pricing.id,
      context.pricing.currencyCode,
      context.pricing.callerRatePerMinuteMinor.toString(),
      context.listenerBase.ratePerMinuteMinor.toString(),
      context.listenerBase.currencyCode,
      authorization.authorizedMinor.toString(),
      authorization.maxBillableSeconds,
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
      bookingId: booking.id,
      callerMarketId: context.market.id,
      callerMarketCode: context.market.code,
      pricingPlanId: context.pricing.id,
      quoteBound: true,
      listenerBaseCurrencyCode: context.listenerBase.currencyCode,
      listenerBaseRatePerMinuteMinor: context.listenerBase.ratePerMinuteMinor.toString(),
    })]);
    await client.query(`
      UPDATE app.call_reservations
      SET status='initiated', call_session_id=$2, initiated_at=now(), updated_at=now()
      WHERE id=$1
    `, [booking.id, row.id]);

    return {
      kind: 'call' as const,
      callId: row.id,
      status: row.status,
      listenerId: row.listener_user_id,
      currencyCode: row.currency_code,
      authorizedMinor: row.authorized_minor,
      maxBillableSeconds: row.max_billable_seconds,
      pricingPlanId: row.pricing_plan_id,
      callerMarketId: row.caller_market_id,
      idempotent: false,
    };
  });

  if (call.kind === 'missed') throw new HttpError(409, 'booking_missed');
  const { kind: _kind, ...response } = call;
  sendJson(res, response.idempotent ? 200 : 201, { ok: true, ...response });
}
