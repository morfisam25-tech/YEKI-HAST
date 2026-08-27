import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';

const PRESENCE_STALE_MS = 90_000;
const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];

function optionalGender(value: string | null): 'female' | 'male' | null {
  if (!value || value === 'any') return null;
  if (value === 'female' || value === 'male') return value;
  throw new HttpError(400, 'invalid_gender');
}

function optionalLanguage(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,16}$/.test(normalized)) throw new HttpError(400, 'invalid_language');
  return normalized;
}

function limitFrom(value: string | null): number {
  const parsed = value ? Number(value) : 20;
  if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(400, 'invalid_limit');
  return Math.min(parsed, 50);
}

function isStale(status: string, lastHeartbeatAt: string | null): boolean {
  if (status !== 'online' && status !== 'paused') return false;
  if (!lastHeartbeatAt) return true;
  const timestamp = Date.parse(lastHeartbeatAt);
  return !Number.isFinite(timestamp) || Date.now() - timestamp > PRESENCE_STALE_MS;
}

export async function browseListeners(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const gender = optionalGender(url.searchParams.get('gender'));
  const language = optionalLanguage(url.searchParams.get('language'));
  const onlineOnly = url.searchParams.get('online') !== 'false';
  const limit = limitFrom(url.searchParams.get('limit'));

  const result = await query<{
    listener_user_id: string;
    nickname: string;
    gender: 'female' | 'male';
    is_verified: boolean;
    reliability_score: number;
    short_intro: string | null;
    style_text: string | null;
    completed_calls: number;
    rating_average: string | null;
    rating_count: number;
    presence_status: string;
    languages: Array<{ code: string; nameFa: string; nameEn: string | null; proficiency: string }>;
  }>(`
    WITH ctx AS (
      SELECT p.id product_id, s.id service_id, m.id market_id
      FROM app.products p
      JOIN app.service_catalog s ON s.code='human_listening' AND s.status='active'
      JOIN app.markets m ON m.code='ir' AND m.is_active=true
      WHERE p.code='yeki_hast'
      LIMIT 1
    )
    SELECT
      lp.user_id::text listener_user_id,
      lp.nickname,
      lp.gender::text gender,
      lp.is_verified,
      lp.reliability_score,
      sp.short_intro,
      sp.style_text,
      sp.completed_calls,
      sp.rating_average::text,
      sp.rating_count,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM app.call_sessions busy
          WHERE busy.listener_user_id=lp.user_id
            AND busy.status::text = ANY($5::text[])
        ) THEN 'busy'
        WHEN pres.status IN ('online','paused')
             AND (pres.last_heartbeat_at IS NULL OR pres.last_heartbeat_at <= now() - interval '90 seconds')
          THEN 'offline'
        ELSE COALESCE(pres.status::text, 'offline')
      END presence_status,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'code', l.code,
          'nameFa', l.name_fa,
          'nameEn', l.name_en,
          'proficiency', ll.proficiency::text
        ) ORDER BY l.code)
        FROM app.listener_languages ll
        JOIN app.languages l ON l.id=ll.language_id
        WHERE ll.listener_user_id=lp.user_id AND l.is_active=true
      ), '[]'::jsonb) languages
    FROM ctx c
    JOIN app.listener_profiles lp ON true
    JOIN app.listener_service_profiles sp
      ON sp.listener_user_id=lp.user_id AND sp.service_id=c.service_id AND sp.is_public=true
    JOIN app.listener_applications la
      ON la.user_id=lp.user_id AND la.service_id=c.service_id AND la.status IN ('approved','active')
    LEFT JOIN app.listener_presence pres
      ON pres.listener_user_id=lp.user_id
      AND pres.product_id=c.product_id AND pres.service_id=c.service_id AND pres.market_id=c.market_id
    WHERE lp.is_verified=true
      AND lp.user_id<>$6::uuid
      AND ($1::text IS NULL OR lp.gender::text=$1)
      AND ($2::text IS NULL OR EXISTS (
        SELECT 1
        FROM app.listener_languages ll2
        JOIN app.languages l2 ON l2.id=ll2.language_id
        WHERE ll2.listener_user_id=lp.user_id AND l2.code=$2 AND l2.is_active=true
      ))
      AND ($3::boolean=false OR (
        pres.status='online'
        AND pres.last_heartbeat_at > now() - interval '90 seconds'
        AND NOT EXISTS (
          SELECT 1
          FROM app.call_sessions busy
          WHERE busy.listener_user_id=lp.user_id
            AND busy.status::text = ANY($5::text[])
        )
      ))
    ORDER BY (
      pres.status='online'
      AND pres.last_heartbeat_at > now() - interval '90 seconds'
      AND NOT EXISTS (
        SELECT 1
        FROM app.call_sessions busy
        WHERE busy.listener_user_id=lp.user_id
          AND busy.status::text = ANY($5::text[])
      )
    ) DESC, sp.rating_average DESC NULLS LAST, lp.reliability_score DESC, lp.created_at
    LIMIT $4
  `, [gender, language, onlineOnly, limit, ACTIVE_CALL_STATUSES, userId]);

  sendJson(res, 200, {
    listeners: result.rows.map((row) => ({
      id: row.listener_user_id,
      nickname: row.nickname,
      gender: row.gender,
      verified: row.is_verified,
      reliabilityScore: row.reliability_score,
      shortIntro: row.short_intro,
      listeningStyle: row.style_text,
      completedCalls: row.completed_calls,
      ratingAverage: row.rating_average === null ? null : Number(row.rating_average),
      ratingCount: row.rating_count,
      presence: row.presence_status,
      languages: row.languages,
    })),
  });
}

export async function setListenerPresence(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{
    status?: unknown;
    acceptsMale?: unknown;
    acceptsFemale?: unknown;
  }>(req);
  if (body.status !== 'online' && body.status !== 'offline' && body.status !== 'paused') {
    throw new HttpError(400, 'invalid_presence_status');
  }
  const status = body.status;
  const acceptsMale = typeof body.acceptsMale === 'boolean' ? body.acceptsMale : true;
  const acceptsFemale = typeof body.acceptsFemale === 'boolean' ? body.acceptsFemale : true;
  if (status === 'online' && !acceptsMale && !acceptsFemale) throw new HttpError(400, 'no_callers_accepted');

  const result = await withTransaction(async (client) => {
    const listener = await client.query<{
      application_status: string;
      is_verified: boolean;
      kyc_status: string | null;
    }>(`
      SELECT la.status::text application_status, lp.is_verified, k.status::text kyc_status
      FROM app.listener_profiles lp
      JOIN app.listener_applications la ON la.user_id=lp.user_id
      JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
      LEFT JOIN private_data.listener_kyc k ON k.user_id=lp.user_id
      WHERE lp.user_id=$1
      FOR UPDATE OF la, lp
    `, [userId]);
    const listenerRow = listener.rows[0];
    if (!listenerRow) throw new HttpError(403, 'listener_not_approved');
    if (!listenerRow.is_verified || listenerRow.kyc_status !== 'verified') throw new HttpError(403, 'listener_verification_required');
    if (!['approved', 'active'].includes(listenerRow.application_status)) throw new HttpError(403, 'listener_not_approved');

    const context = await client.query<{ product_id: string; service_id: string; market_id: string }>(`
      SELECT p.id::text product_id, s.id::text service_id, m.id::text market_id
      FROM app.products p
      JOIN app.service_catalog s ON s.code='human_listening' AND s.status='active'
      JOIN app.markets m ON m.code='ir' AND m.is_active=true
      WHERE p.code='yeki_hast'
      LIMIT 1
    `);
    const ctx = context.rows[0];
    if (!ctx) throw new HttpError(503, 'marketplace_unavailable');

    const current = await client.query<{
      current_work_session_id: string | null;
      status: string;
      last_heartbeat_at: string | null;
    }>(`
      SELECT current_work_session_id::text, status::text, last_heartbeat_at::text
      FROM app.listener_presence
      WHERE listener_user_id=$1 AND product_id=$2 AND service_id=$3 AND market_id=$4
      FOR UPDATE
    `, [userId, ctx.product_id, ctx.service_id, ctx.market_id]);

    let workSessionId = current.rows[0]?.current_work_session_id ?? null;
    if (current.rows[0] && isStale(current.rows[0].status, current.rows[0].last_heartbeat_at)) {
      if (workSessionId) {
        await client.query(`
          UPDATE app.listener_work_sessions
          SET ended_at=COALESCE(ended_at, now()), ended_reason=COALESCE(ended_reason, 'heartbeat_timeout')
          WHERE id=$1
        `, [workSessionId]);
      }
      await client.query(`
        UPDATE app.listener_presence
        SET status='offline', current_work_session_id=NULL, online_since=NULL,
            auto_offline_reason='heartbeat_timeout', updated_at=now()
        WHERE listener_user_id=$1 AND product_id=$2 AND service_id=$3 AND market_id=$4
      `, [userId, ctx.product_id, ctx.service_id, ctx.market_id]);
      workSessionId = null;
    }

    if (status === 'online' && !workSessionId) {
      const workSession = await client.query<{ id: string }>(`
        INSERT INTO app.listener_work_sessions(listener_user_id, product_id, service_id, market_id)
        VALUES ($1,$2,$3,$4)
        RETURNING id::text
      `, [userId, ctx.product_id, ctx.service_id, ctx.market_id]);
      workSessionId = workSession.rows[0].id;
    }

    if (status === 'offline' && workSessionId) {
      await client.query(`
        UPDATE app.listener_work_sessions
        SET ended_at=COALESCE(ended_at, now()), ended_reason=COALESCE(ended_reason, 'user_offline')
        WHERE id=$1
      `, [workSessionId]);
      workSessionId = null;
    }

    await client.query(`
      INSERT INTO app.listener_presence(
        listener_user_id, product_id, service_id, market_id,
        status, accepts_male, accepts_female, current_work_session_id,
        online_since, last_heartbeat_at, auto_offline_reason
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        CASE WHEN $5='online' THEN now() ELSE NULL END,
        CASE WHEN $5 IN ('online','paused') THEN now() ELSE NULL END,
        NULL
      )
      ON CONFLICT (listener_user_id, product_id, service_id, market_id) DO UPDATE SET
        status=EXCLUDED.status,
        accepts_male=EXCLUDED.accepts_male,
        accepts_female=EXCLUDED.accepts_female,
        current_work_session_id=EXCLUDED.current_work_session_id,
        online_since=CASE
          WHEN EXCLUDED.status='online' AND app.listener_presence.online_since IS NULL THEN now()
          WHEN EXCLUDED.status='online' THEN app.listener_presence.online_since
          ELSE NULL
        END,
        last_heartbeat_at=CASE WHEN EXCLUDED.status IN ('online','paused') THEN now() ELSE app.listener_presence.last_heartbeat_at END,
        auto_offline_reason=NULL,
        updated_at=now()
    `, [userId, ctx.product_id, ctx.service_id, ctx.market_id, status, acceptsMale, acceptsFemale, workSessionId]);

    if (status === 'online' && listenerRow.application_status === 'approved') {
      await client.query(`
        UPDATE app.listener_applications la
        SET status='active'
        FROM app.service_catalog s
        WHERE la.user_id=$1 AND la.service_id=s.id AND s.code='human_listening' AND la.status='approved'
      `, [userId]);
    }

    return { status, acceptsMale, acceptsFemale, workSessionId };
  });

  sendJson(res, 200, { ok: true, ...result });
}

export async function heartbeatListenerPresence(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await query<{ status: string }>(`
    UPDATE app.listener_presence pres
    SET last_heartbeat_at=now(), updated_at=now()
    FROM app.products p, app.service_catalog s, app.markets m
    WHERE pres.listener_user_id=$1
      AND pres.product_id=p.id AND p.code='yeki_hast'
      AND pres.service_id=s.id AND s.code='human_listening'
      AND pres.market_id=m.id AND m.code='ir'
      AND pres.status IN ('online','paused')
      AND pres.last_heartbeat_at > now() - interval '90 seconds'
    RETURNING pres.status::text
  `, [userId]);
  if (!result.rows[0]) throw new HttpError(409, 'listener_not_online');
  sendJson(res, 200, { ok: true, status: result.rows[0].status });
}

export async function getListenerPresence(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await withTransaction(async (client) => {
    const rowResult = await client.query<{
      status: string;
      accepts_male: boolean;
      accepts_female: boolean;
      online_since: string | null;
      last_heartbeat_at: string | null;
      current_work_session_id: string | null;
    }>(`
      SELECT pres.status::text, pres.accepts_male, pres.accepts_female,
             pres.online_since::text, pres.last_heartbeat_at::text,
             pres.current_work_session_id::text
      FROM app.listener_presence pres
      JOIN app.products p ON p.id=pres.product_id AND p.code='yeki_hast'
      JOIN app.service_catalog s ON s.id=pres.service_id AND s.code='human_listening'
      JOIN app.markets m ON m.id=pres.market_id AND m.code='ir'
      WHERE pres.listener_user_id=$1
      FOR UPDATE OF pres
    `, [userId]);
    const row = rowResult.rows[0];
    if (!row) {
      return { status: 'offline', acceptsMale: true, acceptsFemale: true, onlineSince: null, lastHeartbeatAt: null };
    }

    if (isStale(row.status, row.last_heartbeat_at)) {
      if (row.current_work_session_id) {
        await client.query(`
          UPDATE app.listener_work_sessions
          SET ended_at=COALESCE(ended_at, now()), ended_reason=COALESCE(ended_reason, 'heartbeat_timeout')
          WHERE id=$1
        `, [row.current_work_session_id]);
      }
      await client.query(`
        UPDATE app.listener_presence pres
        SET status='offline', current_work_session_id=NULL, online_since=NULL,
            auto_offline_reason='heartbeat_timeout', updated_at=now()
        FROM app.products p, app.service_catalog s, app.markets m
        WHERE pres.listener_user_id=$1
          AND pres.product_id=p.id AND p.code='yeki_hast'
          AND pres.service_id=s.id AND s.code='human_listening'
          AND pres.market_id=m.id AND m.code='ir'
      `, [userId]);
      return {
        status: 'offline',
        acceptsMale: row.accepts_male,
        acceptsFemale: row.accepts_female,
        onlineSince: null,
        lastHeartbeatAt: row.last_heartbeat_at,
      };
    }

    return {
      status: row.status,
      acceptsMale: row.accepts_male,
      acceptsFemale: row.accepts_female,
      onlineSince: row.online_since,
      lastHeartbeatAt: row.last_heartbeat_at,
    };
  });

  sendJson(res, 200, result);
}
