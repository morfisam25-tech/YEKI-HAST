import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext } from '../lib/caller-market.ts';
import { HttpError, sendJson } from '../lib/http.ts';
import { getDefaultOperatingContextCodes } from '../lib/operating-context.ts';
import { INTERNAL_OWNER_TEST_LISTENER_ID, isInternalOwnerTestCaller } from '../lib/internal-owner-test.ts';
import { browseBookableListeners } from './booking-discovery.ts';
import { getListenerBookableAvailability } from './bookings.ts';

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

async function validateCallerMarketWhenSelected(userId: string): Promise<void> {
  try {
    await resolveCallerMarketContext(userId);
  } catch (error) {
    // Discovery is one shared Persian marketplace and is not segmented by Caller country.
    // A brand-new Caller may browse before explicitly choosing a billing market. Once a
    // market is persisted, an invalid/inactive pricebook must fail closed even for discovery.
    if (error instanceof HttpError && error.code === 'caller_market_required') return;
    throw error;
  }
}

export async function browseCallerListeners(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await validateCallerMarketWhenSelected(userId);

  const url = new URL(req.url ?? '/', 'http://localhost');
  const gender = optionalGender(url.searchParams.get('gender'));
  const language = optionalLanguage(url.searchParams.get('language'));
  const onlineOnly = url.searchParams.get('online') !== 'false';
  const limit = limitFrom(url.searchParams.get('limit'));
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();
  const ownerTest = isInternalOwnerTestCaller(userId);

  const result = await query<{
    listener_user_id: string;
    nickname: string;
    gender: 'female' | 'male';
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
      JOIN app.service_catalog s ON s.code=$8 AND s.status='active'
      JOIN app.markets m ON m.code=$9 AND m.is_active=true
      WHERE p.code=$7
      LIMIT 1
    ), caller AS (
      SELECT (
        SELECT cp.declared_gender::text
        FROM app.caller_profiles cp
        WHERE cp.user_id=$6
      ) AS declared_gender
    )
    SELECT
      lp.user_id::text listener_user_id,
      lp.nickname,
      lp.gender::text gender,
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
    CROSS JOIN caller cp
    JOIN app.listener_profiles lp ON true
    JOIN app.users mu ON mu.id=lp.user_id AND mu.status='active'
    JOIN app.listener_service_profiles sp
      ON sp.listener_user_id=lp.user_id AND sp.service_id=c.service_id
      AND (sp.is_public=true OR ($10::boolean AND lp.user_id=$11::uuid))
    JOIN app.listener_applications la
      ON la.user_id=lp.user_id AND la.service_id=c.service_id
      AND (la.status IN ('approved','active') OR ($10::boolean AND lp.user_id=$11::uuid))
    LEFT JOIN app.listener_presence pres
      ON pres.listener_user_id=lp.user_id
      AND pres.product_id=c.product_id AND pres.service_id=c.service_id AND pres.market_id=c.market_id
    WHERE (lp.is_verified=true OR ($10::boolean AND lp.user_id=$11::uuid))
      AND lp.user_id<>$6::uuid
      AND NOT EXISTS (
        SELECT 1 FROM app.blocks b
        WHERE ((b.blocker_user_id=$6 AND b.blocked_user_id=lp.user_id)
            OR (b.blocker_user_id=lp.user_id AND b.blocked_user_id=$6))
          AND (b.expires_at IS NULL OR b.expires_at>now())
      )
      AND ($1::text IS NULL OR lp.gender::text=$1)
      AND ($2::text IS NULL OR EXISTS (
        SELECT 1
        FROM app.listener_languages ll2
        JOIN app.languages l2 ON l2.id=ll2.language_id
        WHERE ll2.listener_user_id=lp.user_id AND l2.code=$2 AND l2.is_active=true
      ))
      AND (
        cp.declared_gender IS NULL
        OR (cp.declared_gender='male' AND pres.accepts_male=true)
        OR (cp.declared_gender='female' AND pres.accepts_female=true)
      )
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
  `, [gender, language, onlineOnly, limit, ACTIVE_CALL_STATUSES, userId, productCode, serviceCode, marketCode,
    ownerTest, INTERNAL_OWNER_TEST_LISTENER_ID]);

  sendJson(res, 200, {
    listeners: result.rows.map((row) => ({
      id: row.listener_user_id,
      nickname: row.nickname,
      gender: row.gender,
      // Work eligibility means the account passed the Listener approval flow.
      // It is deliberately not named "verified" and makes no broad identity claim.
      workEligible: true,
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

export async function browseCallerBookableListeners(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await validateCallerMarketWhenSelected(userId);
  return browseBookableListeners(req, res);
}

export async function getCallerListenerAvailability(
  req: IncomingMessage,
  res: ServerResponse,
  listenerId: string,
) {
  const { userId } = await requireAuth(req);
  await validateCallerMarketWhenSelected(userId);
  return getListenerBookableAvailability(req, res, listenerId);
}
