import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction, query } from '@yeki-hast/db';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';

const proficiencies = new Set(['conversational', 'fluent', 'native']);

export async function createListenerApplication(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{
    nickname?: unknown;
    gender?: unknown;
    shortIntro?: unknown;
    listeningStyle?: unknown;
    languages?: unknown;
  }>(req);
  const nickname = requireString(body.nickname, 'nickname', 2, 40);
  if (body.gender !== 'female' && body.gender !== 'male') throw new HttpError(400, 'invalid_gender');
  const shortIntro = typeof body.shortIntro === 'string' ? body.shortIntro.trim().slice(0, 500) : null;
  const listeningStyle = typeof body.listeningStyle === 'string' ? body.listeningStyle.trim().slice(0, 160) : null;
  if (!Array.isArray(body.languages) || body.languages.length < 1 || body.languages.length > 10) {
    throw new HttpError(400, 'languages_required');
  }
  const languages = body.languages.map((item) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'invalid_language');
    const code = String((item as { code?: unknown }).code ?? '').trim();
    const proficiency = String((item as { proficiency?: unknown }).proficiency ?? '');
    if (!code || !proficiencies.has(proficiency)) throw new HttpError(400, 'invalid_language');
    return { code, proficiency };
  });

  const applicationId = await withTransaction(async (client) => {
    const service = await client.query<{ id: string }>("SELECT id::text FROM app.service_catalog WHERE code='human_listening' AND status='active'");
    const serviceId = service.rows[0]?.id;
    if (!serviceId) throw new HttpError(503, 'human_listening_service_unavailable');
    const codes = [...new Set(languages.map((x) => x.code))];
    const langRows = await client.query<{ id: string; code: string }>(
      'SELECT id::text, code FROM app.languages WHERE code = ANY($1::text[]) AND is_active=true', [codes],
    );
    if (langRows.rowCount !== codes.length) throw new HttpError(400, 'unknown_language');
    const idByCode = new Map(langRows.rows.map((x) => [x.code, x.id]));

    await client.query("INSERT INTO app.user_roles(user_id, role) VALUES ($1,'listener') ON CONFLICT DO NOTHING", [userId]);
    const appResult = await client.query<{ id: string }>(`
      INSERT INTO app.listener_applications AS existing(user_id, service_id, nickname, declared_gender, short_intro, listening_style)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id, service_id) DO UPDATE SET
        nickname=EXCLUDED.nickname, declared_gender=EXCLUDED.declared_gender,
        short_intro=EXCLUDED.short_intro, listening_style=EXCLUDED.listening_style, updated_at=now()
      WHERE existing.status IN ('exploring','training','assessment')
      RETURNING id::text
    `, [userId, serviceId, nickname, body.gender, shortIntro, listeningStyle]);
    const applicationId = appResult.rows[0]?.id;
    if (!applicationId) throw new HttpError(409, 'application_locked');
    await client.query('DELETE FROM app.listener_application_languages WHERE application_id=$1', [applicationId]);
    for (const language of languages) {
      await client.query(`
        INSERT INTO app.listener_application_languages(application_id, language_id, proficiency)
        VALUES ($1,$2,$3)
      `, [applicationId, idByCode.get(language.code), language.proficiency]);
    }
    return applicationId;
  });

  sendJson(res, 200, { ok: true, applicationId, status: 'exploring' });
}

export async function getListenerApplication(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await query<{
    id: string; status: string; nickname: string; declared_gender: string;
    short_intro: string | null; listening_style: string | null; created_at: string;
  }>(`
    SELECT la.id::text, la.status::text, la.nickname, la.declared_gender::text,
           la.short_intro, la.listening_style, la.created_at::text
    FROM app.listener_applications la
    JOIN app.service_catalog s ON s.id=la.service_id
    WHERE la.user_id=$1 AND s.code='human_listening'
  `, [userId]);
  if (!result.rows[0]) throw new HttpError(404, 'listener_application_not_found');
  const langs = await query<{ code: string; proficiency: string }>(`
    SELECT l.code, lal.proficiency::text
    FROM app.listener_application_languages lal
    JOIN app.languages l ON l.id=lal.language_id
    WHERE lal.application_id=$1 ORDER BY l.code
  `, [result.rows[0].id]);
  sendJson(res, 200, { ...result.rows[0], languages: langs.rows });
}
