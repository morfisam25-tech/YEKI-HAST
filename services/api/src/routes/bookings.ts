import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { computeCallAuthorization } from '../domain/call-authorization.ts';
import { requireWave1SessionCapSeconds } from '../domain/session-policy.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { getDefaultOperatingContextCodes } from '../lib/operating-context.ts';
import { requireCurrentCallerAgeAssertion } from './caller.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];

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
  const parsed = Number(value);
  try {
    return requireWave1SessionCapSeconds(parsed);
  } catch {
    throw new HttpError(400, 'invalid_session_cap');
  }
}

function parseOptionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

async function expireMissedReservations(): Promise<void> {
  await query('SELECT app.expire_due_call_reservations()');
}

export async function getOwnListenerAvailability(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();
  const result = await query<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    accepts_male: boolean;
    accepts_female: boolean;
  }>(`
    SELECT a.id::text, a.starts_at::text, a.ends_at::text, a.status,
           a.accepts_male, a.accepts_female
    FROM app.listener_availability a
    JOIN app.products p ON p.id=a.product_id AND p.code=$2
    JOIN app.service_catalog s ON s.id=a.service_id AND s.code=$3
    JOIN app.markets m ON m.id=a.market_id AND m.code=$4
    WHERE a.listener_user_id=$1
      AND a.ends_at > now() - interval '1 day'
    ORDER BY a.starts_at
    LIMIT 100
  `, [userId, productCode, serviceCode, marketCode]);

  sendJson(res, 200, {
    availability: result.rows.map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      acceptsMale: row.accepts_male,
      acceptsFemale: row.accepts_female,
    })),
  });
}

export async function createListenerAvailability(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{
    startsAt?: unknown;
    endsAt?: unknown;
    acceptsMale?: unknown;
    acceptsFemale?: unknown;
  }>(req);
  const startsAt = parseInstant(body.startsAt, 'invalid_starts_at');
  const endsAt = parseInstant(body.endsAt, 'invalid_ends_at');
  if (startsAt.getTime() <= Date.now() || endsAt.getTime() <= startsAt.getTime()) {
    throw new HttpError(400, 'invalid_availability_window');
  }
  const acceptsMale = parseOptionalBoolean(body.acceptsMale, true);
  const acceptsFemale = parseOptionalBoolean(body.acceptsFemale, true);
  if (!acceptsMale && !acceptsFemale) throw new HttpError(400, 'no_callers_accepted');
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();

  const created = await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:listener_availability:' || $1::text, 0))",
      [userId],
    );

    const eligibility = await client.query<{ ok: boolean }>(`
      SELECT true ok
      FROM app.listener_profiles lp
      JOIN app.listener_applications la ON la.user_id=lp.user_id
      JOIN app.service_catalog s ON s.id=la.service_id AND s.code=$2
      LEFT JOIN private_data.listener_kyc k ON k.user_id=lp.user_id
      WHERE lp.user_id=$1
        AND lp.is_verified=true
        AND k.status::text='verified'
        AND la.status::text IN ('approved','active')
      LIMIT 1
    `, [userId, serviceCode]);
    if (!eligibility.rows[0]) throw new HttpError(403, 'listener_not_approved');

    const context = await client.query<{ product_id: string; service_id: string; market_id: string }>(`
      SELECT p.id::text product_id, s.id::text service_id, m.id::text market_id
      FROM app.products p
      JOIN app.service_catalog s ON s.code=$2 AND s.status='active'
      JOIN app.markets m ON m.code=$3 AND m.is_active=true
      WHERE p.code=$1
      LIMIT 1
    `, [productCode, serviceCode, marketCode]);
    const ctx = context.rows[0];
    if (!ctx) throw new HttpError(503, 'marketplace_unavailable');

    const overlapping = await client.query<{ id: string }>(`
      SELECT id::text
      FROM app.listener_availability
      WHERE listener_user_id=$1
        AND product_id=$2 AND service_id=$3 AND market_id=$4
        AND status='open'
        AND starts_at < $6::timestamptz
        AND ends_at > $5::timestamptz
      LIMIT 1
      FOR UPDATE
    `, [userId, ctx.product_id, ctx.service_id, ctx.market_id, startsAt.toISOString(), endsAt.toISOString()]);
    if (overlapping.rows[0]) throw new HttpError(409, 'availability_overlap');

    const result = await client.query<{
      id: string; starts_at: string; ends_at: string; accepts_male: boolean; accepts_female: boolean;
    }>(`
      INSERT INTO app.listener_availability(
        listener_user_id, product_id, service_id, market_id,
        starts_at, ends_at, accepts_male, accepts_female
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id::text, starts_at::text, ends_at::text, accepts_male, accepts_female
    `, [
      userId, ctx.product_id, ctx.service_id, ctx.market_id,
      startsAt.toISOString(), endsAt.toISOString(), acceptsMale, acceptsFemale,
    ]);
    return result.rows[0];
  });

  sendJson(res, 201, {
    ok: true,
    availability: {
      id: created.id,
      startsAt: created.starts_at,
      endsAt: created.ends_at,
      acceptsMale: created.accepts_male,
      acceptsFemale: created.accepts_female,
    },
  });
}

export async function cancelListenerAvailability(
  req: IncomingMessage,
  res: ServerResponse,
  availabilityId: string,
) {
  const { userId } = await requireAuth(req);
  if (!UUID_RE.test(availabilityId)) throw new HttpError(400, 'invalid_availability');

  const result = await withTransaction(async (client) => {
    const rowResult = await client.query<{ id: string; status: string }>(`
      SELECT id::text, status
      FROM app.listener_availability
      WHERE id=$1 AND listener_user_id=$2
      FOR UPDATE
    `, [availabilityId, userId]);
    const row = rowResult.rows[0];
    if (!row) throw new HttpError(404, 'availability_not_found');
    if (row.status === 'cancelled') return { id: row.id, idempotent: true };

    const booked = await client.query<{ id: string }>(`
      SELECT id::text
      FROM app.call_reservations
      WHERE availability_id=$1 AND status IN ('booked','initiated')
      LIMIT 1
      FOR UPDATE
    `, [availabilityId]);
    if (booked.rows[0]) throw new HttpError(409, 'availability_has_reservations');

    await client.query(`
      UPDATE app.listener_availability
      SET status='cancelled', cancelled_at=now(), updated_at=now()
      WHERE id=$1
    `, [availabilityId]);
    return { id: row.id, idempotent: false };
  });

  sendJson(res, 200, { ok: true, availabilityId: result.id, idempotent: result.idempotent });
}

export async function getListenerBookableAvailability(
  req: IncomingMessage,
  res: ServerResponse,
  listenerId: string,
) {
  const { userId } = await requireAuth(req);
  if (!UUID_RE.test(listenerId)) throw new HttpError(400, 'invalid_listener');
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();

  const caller = await query<{ declared_gender: string | null }>(
    'SELECT declared_gender::text FROM app.caller_profiles WHERE user_id=$1',
    [userId],
  );
  const callerGender = caller.rows[0]?.declared_gender ?? null;

  const availability = await query<{
    id: string;
    starts_at: string;
    ends_at: string;
    accepts_male: boolean;
    accepts_female: boolean;
  }>(`
    SELECT a.id::text, a.starts_at::text, a.ends_at::text,
           a.accepts_male, a.accepts_female
    FROM app.listener_availability a
    JOIN app.products p ON p.id=a.product_id AND p.code=$3
    JOIN app.service_catalog s ON s.id=a.service_id AND s.code=$4 AND s.status='active'
    JOIN app.markets m ON m.id=a.market_id AND m.code=$5 AND m.is_active=true
    JOIN app.listener_profiles lp ON lp.user_id=a.listener_user_id AND lp.is_verified=true
    JOIN app.listener_applications la
      ON la.user_id=a.listener_user_id AND la.service_id=a.service_id AND la.status IN ('approved','active')
    WHERE a.listener_user_id=$1
      AND a.status='open'
      AND a.ends_at > now()
      AND a.listener_user_id<>$2::uuid
      AND ($6::text IS NULL
        OR ($6='male' AND a.accepts_male=true)
        OR ($6='female' AND a.accepts_female=true))
      AND NOT EXISTS (
        SELECT 1 FROM app.blocks b
        WHERE ((b.blocker_user_id=$2 AND b.blocked_user_id=a.listener_user_id)
            OR (b.blocker_user_id=a.listener_user_id AND b.blocked_user_id=$2))
          AND (b.expires_at IS NULL OR b.expires_at>now())
      )
    ORDER BY a.starts_at
    LIMIT 100
  `, [listenerId, userId, productCode, serviceCode, marketCode, callerGender]);

  const ids = availability.rows.map((row) => row.id);
  const reservations = ids.length === 0 ? { rows: [] as Array<{ availability_id: string; scheduled_at: string; max_billable_seconds: number }> } : await query<{
    availability_id: string;
    scheduled_at: string;
    max_billable_seconds: number;
  }>(`
    SELECT availability_id::text, scheduled_at::text, max_billable_seconds
    FROM app.call_reservations
    WHERE availability_id = ANY($1::uuid[])
      AND status IN ('booked','initiated')
    ORDER BY scheduled_at
  `, [ids]);

  const busyByAvailability = new Map<string, Array<{ startsAt: string; endsAt: string }>>();
  for (const reservation of reservations.rows) {
    const startsAt = new Date(reservation.scheduled_at);
    const endsAt = new Date(startsAt.getTime() + reservation.max_billable_seconds * 1000);
    const list = busyByAvailability.get(reservation.availability_id) ?? [];
    list.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    busyByAvailability.set(reservation.availability_id, list);
  }

  sendJson(res, 200, {
    listenerId,
    availability: availability.rows.map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      busy: busyByAvailability.get(row.id) ?? [],
    })),
  });
}

export async function createBooking(req: IncomingMessage, res: ServerResponse) {
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
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();

  const booking = await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:booking_caller:' || $1::text, 0))",
      [userId],
    );

    const existing = await client.query<{
      id: string; listener_user_id: string; scheduled_at: string; max_billable_seconds: number; status: string;
    }>(`
      SELECT id::text, listener_user_id::text, scheduled_at::text, max_billable_seconds, status
      FROM app.call_reservations
      WHERE caller_user_id=$1 AND client_request_id=$2
      FOR UPDATE
    `, [userId, clientRequestId]);
    if (existing.rows[0]) return { ...existing.rows[0], idempotent: true };

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
      JOIN app.products p ON p.id=a.product_id AND p.code=$6
      JOIN app.service_catalog s ON s.id=a.service_id AND s.code=$7 AND s.status='active'
      JOIN app.markets m ON m.id=a.market_id AND m.code=$8 AND m.is_active=true
      JOIN app.listener_profiles lp ON lp.user_id=a.listener_user_id AND lp.is_verified=true
      JOIN app.listener_applications la
        ON la.user_id=a.listener_user_id AND la.service_id=a.service_id AND la.status IN ('approved','active')
      WHERE a.id=$1
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
      availabilityId, userId, scheduledAt.toISOString(), scheduledEnd.toISOString(), callerGender,
      productCode, serviceCode, marketCode,
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

    const overlap = await client.query<{ id: string }>(`
      SELECT id::text
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
      id: string; listener_user_id: string; scheduled_at: string; max_billable_seconds: number; status: string;
    }>(`
      INSERT INTO app.call_reservations(
        product_id, service_id, market_id, availability_id,
        caller_user_id, listener_user_id, language_id, client_request_id,
        scheduled_at, max_billable_seconds
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id::text, listener_user_id::text, scheduled_at::text, max_billable_seconds, status
    `, [
      slot.product_id, slot.service_id, slot.market_id, availabilityId,
      userId, slot.listener_user_id, languageId, clientRequestId,
      scheduledAt.toISOString(), maxSeconds,
    ]);
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
      idempotent: booking.idempotent,
    },
  });
}

export async function getCallerBookings(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await expireMissedReservations();
  const result = await query<{
    id: string;
    listener_user_id: string;
    nickname: string;
    language_code: string;
    scheduled_at: string;
    max_billable_seconds: number;
    status: string;
    call_session_id: string | null;
  }>(`
    SELECT r.id::text, r.listener_user_id::text, lp.nickname, l.code language_code,
           r.scheduled_at::text, r.max_billable_seconds, r.status,
           r.call_session_id::text
    FROM app.call_reservations r
    JOIN app.listener_profiles lp ON lp.user_id=r.listener_user_id
    JOIN app.languages l ON l.id=r.language_id
    WHERE r.caller_user_id=$1
    ORDER BY (r.status='booked') DESC, r.scheduled_at DESC
    LIMIT 100
  `, [userId]);

  sendJson(res, 200, {
    bookings: result.rows.map((row) => ({
      id: row.id,
      listenerId: row.listener_user_id,
      listenerNickname: row.nickname,
      languageCode: row.language_code,
      scheduledAt: row.scheduled_at,
      maxBillableSeconds: row.max_billable_seconds,
      status: row.status,
      callId: row.call_session_id,
    })),
  });
}

export async function getListenerBookings(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await expireMissedReservations();
  const result = await query<{
    id: string;
    language_code: string;
    scheduled_at: string;
    max_billable_seconds: number;
    status: string;
    call_session_id: string | null;
  }>(`
    SELECT r.id::text, l.code language_code, r.scheduled_at::text,
           r.max_billable_seconds, r.status, r.call_session_id::text
    FROM app.call_reservations r
    JOIN app.languages l ON l.id=r.language_id
    WHERE r.listener_user_id=$1
    ORDER BY (r.status='booked') DESC, r.scheduled_at DESC
    LIMIT 100
  `, [userId]);

  sendJson(res, 200, {
    bookings: result.rows.map((row) => ({
      id: row.id,
      languageCode: row.language_code,
      scheduledAt: row.scheduled_at,
      maxBillableSeconds: row.max_billable_seconds,
      status: row.status,
      callId: row.call_session_id,
    })),
  });
}

export async function cancelBooking(req: IncomingMessage, res: ServerResponse, bookingId: string) {
  const { userId } = await requireAuth(req);
  if (!UUID_RE.test(bookingId)) throw new HttpError(400, 'invalid_booking');
  const result = await withTransaction(async (client) => {
    const bookingResult = await client.query<{ id: string; status: string }>(`
      SELECT id::text, status
      FROM app.call_reservations
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [bookingId, userId]);
    const booking = bookingResult.rows[0];
    if (!booking) throw new HttpError(404, 'booking_not_found');
    if (booking.status === 'cancelled') return { idempotent: true };
    if (booking.status !== 'booked') throw new HttpError(409, 'booking_already_started');

    await client.query(`
      UPDATE app.call_reservations
      SET status='cancelled', cancelled_at=now(), updated_at=now()
      WHERE id=$1
    `, [bookingId]);
    return { idempotent: false };
  });

  sendJson(res, 200, { ok: true, bookingId, idempotent: result.idempotent });
}

export async function startBooking(req: IncomingMessage, res: ServerResponse, bookingId: string) {
  const { userId } = await requireAuth(req);
  await requireCurrentCallerAgeAssertion(userId);
  if (!UUID_RE.test(bookingId)) throw new HttpError(400, 'invalid_booking');

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
      listener_user_id: string;
      language_id: string;
      scheduled_at: string;
      max_billable_seconds: number;
      call_session_id: string | null;
    }>(`
      SELECT id::text, status, product_id::text, service_id::text, market_id::text,
             listener_user_id::text, language_id::text, scheduled_at::text,
             max_billable_seconds, call_session_id::text
      FROM app.call_reservations
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [bookingId, userId]);
    const booking = result.rows[0];
    if (!booking) throw new HttpError(404, 'booking_not_found');

    if (booking.status === 'initiated' && booking.call_session_id) {
      const existing = await client.query<{
        id: string; status: string; listener_user_id: string; currency_code: string;
        authorized_minor: string; max_billable_seconds: number;
      }>(`
        SELECT id::text, status::text, listener_user_id::text, currency_code,
               authorized_minor::text, max_billable_seconds
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

    const active = await client.query<{ id: string }>(`
      SELECT id::text
      FROM app.call_sessions
      WHERE status::text = ANY($3::text[])
        AND (caller_user_id=$1::uuid OR listener_user_id=$2::uuid)
      ORDER BY requested_at DESC
      LIMIT 1
      FOR UPDATE
    `, [userId, booking.listener_user_id, ACTIVE_CALL_STATUSES]);
    if (active.rows[0]) throw new HttpError(409, 'booking_party_busy');

    const pricing = await client.query<{
      pricing_plan_id: string;
      currency_code: string;
      caller_rate: string;
      listener_rate: string;
      billing_increment_seconds: number;
    }>(`
      SELECT pp.id::text pricing_plan_id, pp.currency_code,
             pp.caller_rate_per_minute_minor::text caller_rate,
             pp.listener_rate_per_minute_minor::text listener_rate,
             pp.billing_increment_seconds
      FROM app.pricing_plans pp
      WHERE pp.product_id=$1 AND pp.service_id=$2 AND pp.market_id=$3 AND pp.is_active=true
      LIMIT 1
    `, [booking.product_id, booking.service_id, booking.market_id]);
    const price = pricing.rows[0];
    if (!price) throw new HttpError(503, 'call_market_unavailable');

    await client.query(`
      INSERT INTO app.wallets(user_id, currency_code)
      VALUES ($1,$2)
      ON CONFLICT (user_id, currency_code) DO NOTHING
    `, [userId, price.currency_code]);
    const wallet = await client.query<{ id: string; balance_minor: string; reserved_minor: string }>(`
      SELECT id::text, balance_minor::text, reserved_minor::text
      FROM app.wallets
      WHERE user_id=$1 AND currency_code=$2
      FOR UPDATE
    `, [userId, price.currency_code]);
    const walletRow = wallet.rows[0];
    if (!walletRow) throw new HttpError(503, 'wallet_unavailable');

    const authorization = computeCallAuthorization({
      balanceMinor: BigInt(walletRow.balance_minor),
      reservedMinor: BigInt(walletRow.reserved_minor),
      callerRatePerMinuteMinor: BigInt(price.caller_rate),
      billingIncrementSeconds: price.billing_increment_seconds,
      requestedMaxSeconds: booking.max_billable_seconds,
    });
    if (!authorization) throw new HttpError(402, 'insufficient_balance');

    const inserted = await client.query<{
      id: string; status: string; listener_user_id: string; currency_code: string;
      authorized_minor: string; max_billable_seconds: number;
    }>(`
      INSERT INTO app.call_sessions(
        product_id, service_id, market_id, caller_user_id, listener_user_id,
        client_request_id, status, requested_listener_gender, requested_language_id,
        pricing_plan_id, currency_code, caller_rate_per_minute_minor,
        listener_rate_per_minute_minor, authorized_minor, max_billable_seconds
      ) VALUES ($1,$2,$3,$4,$5,$6,'routing','any',$7,$8,$9,$10,$11,$12,$13)
      RETURNING id::text, status::text, listener_user_id::text, currency_code,
                authorized_minor::text, max_billable_seconds
    `, [
      booking.product_id, booking.service_id, booking.market_id, userId, booking.listener_user_id,
      `booking:${booking.id}`, booking.language_id, price.pricing_plan_id, price.currency_code,
      price.caller_rate, price.listener_rate, authorization.authorizedMinor.toString(),
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

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'routing','api',jsonb_build_object('bookingId',$2))
    `, [row.id, booking.id]);
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
      idempotent: false,
    };
  });

  if (call.kind === 'missed') throw new HttpError(409, 'booking_missed');
  const { kind: _kind, ...response } = call;
  sendJson(res, 201, { ok: true, ...response });
}
