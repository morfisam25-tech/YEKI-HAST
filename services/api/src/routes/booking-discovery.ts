import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';
import { getDefaultOperatingContextCodes } from '../lib/operating-context.ts';

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

export async function browseBookableListeners(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const gender = optionalGender(url.searchParams.get('gender'));
  const language = optionalLanguage(url.searchParams.get('language'));
  const limit = limitFrom(url.searchParams.get('limit'));
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();

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
    next_available_at: string;
    languages: Array<{ code: string; nameFa: string; nameEn: string | null; proficiency: string }>;
  }>(`
    WITH ctx AS (
      SELECT p.id product_id, s.id service_id, m.id market_id
      FROM app.products p
      JOIN app.service_catalog s ON s.code=$6 AND s.status='active'
      JOIN app.markets m ON m.code=$7 AND m.is_active=true
      WHERE p.code=$5
      LIMIT 1
    ), caller AS (
      SELECT (
        SELECT cp.declared_gender::text
        FROM app.caller_profiles cp
        WHERE cp.user_id=$4
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
      MIN(a.starts_at)::text next_available_at,
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
    JOIN app.listener_profiles lp ON lp.is_verified=true
    JOIN app.listener_service_profiles sp
      ON sp.listener_user_id=lp.user_id AND sp.service_id=c.service_id AND sp.is_public=true
    JOIN app.listener_applications la
      ON la.user_id=lp.user_id AND la.service_id=c.service_id AND la.status IN ('approved','active')
    JOIN app.listener_availability a
      ON a.listener_user_id=lp.user_id
      AND a.product_id=c.product_id AND a.service_id=c.service_id AND a.market_id=c.market_id
      AND a.status='open' AND a.ends_at>now()
    WHERE lp.user_id<>$4::uuid
      AND ($1::text IS NULL OR lp.gender::text=$1)
      AND ($2::text IS NULL OR EXISTS (
        SELECT 1
        FROM app.listener_languages ll2
        JOIN app.languages l2 ON l2.id=ll2.language_id
        WHERE ll2.listener_user_id=lp.user_id AND l2.code=$2 AND l2.is_active=true
      ))
      AND (
        cp.declared_gender IS NULL
        OR (cp.declared_gender='male' AND a.accepts_male=true)
        OR (cp.declared_gender='female' AND a.accepts_female=true)
      )
      AND NOT EXISTS (
        SELECT 1 FROM app.blocks b
        WHERE ((b.blocker_user_id=$4 AND b.blocked_user_id=lp.user_id)
            OR (b.blocker_user_id=lp.user_id AND b.blocked_user_id=$4))
          AND (b.expires_at IS NULL OR b.expires_at>now())
      )
    GROUP BY lp.user_id, lp.nickname, lp.gender, lp.reliability_score,
             sp.short_intro, sp.style_text, sp.completed_calls, sp.rating_average, sp.rating_count
    ORDER BY MIN(a.starts_at), sp.rating_average DESC NULLS LAST, lp.reliability_score DESC
    LIMIT $3
  `, [gender, language, limit, userId, productCode, serviceCode, marketCode]);

  sendJson(res, 200, {
    listeners: result.rows.map((row) => ({
      id: row.listener_user_id,
      nickname: row.nickname,
      gender: row.gender,
      verified: true,
      reliabilityScore: row.reliability_score,
      shortIntro: row.short_intro,
      listeningStyle: row.style_text,
      completedCalls: row.completed_calls,
      ratingAverage: row.rating_average === null ? null : Number(row.rating_average),
      ratingCount: row.rating_count,
      nextAvailableAt: row.next_available_at,
      languages: row.languages,
    })),
  });
}
