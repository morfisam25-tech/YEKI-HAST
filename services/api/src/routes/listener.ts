import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction, query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import {
  LISTENER_TRAINING_MODULES,
  isListenerTrainingModule,
  listenerTrainingComplete,
} from '../domain/listener-onboarding.ts';
import {
  listenerKycChecksComplete,
  LISTENER_RULES_CONSENT_VERSION,
} from '../domain/listener-approval.ts';
import type { KycCheckKind, KycCheckStatus } from '../domain/kyc-verification.ts';

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
    for (const moduleKey of LISTENER_TRAINING_MODULES) {
      await client.query(`
        INSERT INTO app.listener_training_progress(application_id, module_key)
        VALUES ($1,$2)
        ON CONFLICT (application_id, module_key) DO NOTHING
      `, [applicationId, moduleKey]);
    }
    await client.query(`
      UPDATE app.listener_applications
      SET status=CASE WHEN status='exploring' THEN 'training'::app.listener_application_status ELSE status END
      WHERE id=$1
    `, [applicationId]);
    return applicationId;
  });

  sendJson(res, 200, { ok: true, applicationId, status: 'training' });
}

export async function completeListenerTraining(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{ moduleKey?: unknown }>(req);
  if (!isListenerTrainingModule(body.moduleKey)) throw new HttpError(400, 'invalid_training_module');
  const moduleKey = body.moduleKey;

  const result = await withTransaction(async (client) => {
    const application = await client.query<{ id: string; status: string }>(`
      SELECT la.id::text, la.status::text
      FROM app.listener_applications la
      JOIN app.service_catalog s ON s.id=la.service_id
      WHERE la.user_id=$1 AND s.code='human_listening'
      FOR UPDATE
    `, [userId]);
    const row = application.rows[0];
    if (!row) throw new HttpError(404, 'listener_application_not_found');
    if (!['exploring', 'training', 'assessment'].includes(row.status)) throw new HttpError(409, 'training_locked');

    await client.query(`
      INSERT INTO app.listener_training_progress(application_id, module_key, status, progress_percent, completed_at)
      VALUES ($1,$2,'completed',100,now())
      ON CONFLICT (application_id, module_key) DO UPDATE SET
        status='completed', progress_percent=100, completed_at=COALESCE(app.listener_training_progress.completed_at, now()), updated_at=now()
    `, [row.id, moduleKey]);

    const progress = await client.query<{ module_key: string; status: string; progress_percent: number }>(`
      SELECT module_key, status::text, progress_percent
      FROM app.listener_training_progress
      WHERE application_id=$1
    `, [row.id]);
    const complete = listenerTrainingComplete(progress.rows);
    const nextStatus = complete ? 'assessment' : 'training';
    if (row.status === 'exploring' || row.status === 'training') {
      await client.query('UPDATE app.listener_applications SET status=$2 WHERE id=$1', [row.id, nextStatus]);
    }
    return { applicationId: row.id, trainingComplete: complete, status: row.status === 'assessment' ? 'assessment' : nextStatus };
  });

  sendJson(res, 200, { ok: true, ...result });
}

export async function submitListenerAssessment(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{ scenarioVersion?: unknown; answers?: unknown }>(req);
  const scenarioVersion = requireString(body.scenarioVersion, 'scenarioVersion', 1, 80);
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    throw new HttpError(400, 'invalid_assessment_answers');
  }
  const answersJson = JSON.stringify(body.answers);
  if (answersJson.length > 12_000) throw new HttpError(400, 'assessment_answers_too_large');

  const attemptId = await withTransaction(async (client) => {
    const application = await client.query<{ id: string; status: string }>(`
      SELECT la.id::text, la.status::text
      FROM app.listener_applications la
      JOIN app.service_catalog s ON s.id=la.service_id
      WHERE la.user_id=$1 AND s.code='human_listening'
      FOR UPDATE
    `, [userId]);
    const row = application.rows[0];
    if (!row) throw new HttpError(404, 'listener_application_not_found');
    if (!['training', 'assessment'].includes(row.status)) throw new HttpError(409, 'assessment_locked');

    const progress = await client.query<{ module_key: string; status: string; progress_percent: number }>(`
      SELECT module_key, status::text, progress_percent
      FROM app.listener_training_progress
      WHERE application_id=$1
    `, [row.id]);
    if (!listenerTrainingComplete(progress.rows)) throw new HttpError(409, 'training_incomplete');

    const pending = await client.query(`
      SELECT 1
      FROM app.listener_assessment_attempts
      WHERE application_id=$1 AND result='pending'
      LIMIT 1
    `, [row.id]);
    if (pending.rowCount) throw new HttpError(409, 'assessment_pending_review');

    const attempt = await client.query<{ id: string }>(`
      INSERT INTO app.listener_assessment_attempts(application_id, result, scenario_version, answers)
      VALUES ($1,'pending',$2,$3::jsonb)
      RETURNING id::text
    `, [row.id, scenarioVersion, answersJson]);
    await client.query(`
      UPDATE app.listener_applications
      SET status='assessment', submitted_at=COALESCE(submitted_at, now())
      WHERE id=$1
    `, [row.id]);
    return attempt.rows[0].id;
  });

  sendJson(res, 202, { ok: true, attemptId, status: 'pending' });
}

export async function acceptListenerAgreement(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{ accepted?: unknown }>(req);
  if (body.accepted !== true) throw new HttpError(400, 'listener_agreement_not_accepted');

  const result = await withTransaction(async (client) => {
    const applicationResult = await client.query<{ id: string; status: string }>(`
      SELECT la.id::text, la.status::text
      FROM app.listener_applications la
      JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
      WHERE la.user_id=$1
      FOR UPDATE OF la
    `, [userId]);
    const application = applicationResult.rows[0];
    if (!application) throw new HttpError(404, 'listener_application_not_found');

    const existingConsent = await client.query(`
      SELECT 1
      FROM app.consents
      WHERE user_id=$1
        AND consent_type='listener_rules'
        AND version=$2
        AND granted=true
        AND revoked_at IS NULL
      LIMIT 1
    `, [userId, LISTENER_RULES_CONSENT_VERSION]);

    if (application.status === 'admin_review' || application.status === 'approved' || application.status === 'active') {
      if (!existingConsent.rowCount) throw new HttpError(409, 'listener_agreement_evidence_missing');
      return { applicationId: application.id, status: application.status, idempotent: true };
    }
    if (application.status !== 'agreement_pending') throw new HttpError(409, 'listener_agreement_not_available');

    const kyc = await client.query<{ status: string }>(`
      SELECT status::text FROM private_data.listener_kyc WHERE user_id=$1
    `, [userId]);
    const checks = await client.query<{ check_kind: KycCheckKind; status: KycCheckStatus }>(`
      SELECT check_kind::text AS check_kind, status::text AS status
      FROM private_data.listener_kyc_checks
      WHERE user_id=$1
      ORDER BY check_kind
    `, [userId]);
    const normalizedChecks = checks.rows.map((row) => ({ checkKind: row.check_kind, status: row.status }));
    if (kyc.rows[0]?.status !== 'verified' || !listenerKycChecksComplete(normalizedChecks)) {
      throw new HttpError(409, 'listener_kyc_incomplete');
    }

    await client.query(`
      INSERT INTO app.consents(user_id, consent_type, version, granted, granted_at, revoked_at)
      VALUES ($1,'listener_rules',$2,true,now(),NULL)
      ON CONFLICT (user_id, consent_type, version) DO UPDATE SET
        granted=true, granted_at=now(), revoked_at=NULL
    `, [userId, LISTENER_RULES_CONSENT_VERSION]);
    await client.query(`
      UPDATE app.listener_applications
      SET status='admin_review', updated_at=now()
      WHERE id=$1 AND status='agreement_pending'
    `, [application.id]);
    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'listener_rules_accepted','listener_application',$2,
              jsonb_build_object('version',$3::text,'nextStatus','admin_review'))
    `, [userId, application.id, LISTENER_RULES_CONSENT_VERSION]);

    return { applicationId: application.id, status: 'admin_review', idempotent: false };
  });

  sendJson(res, 200, { ok: true, ...result, agreementVersion: LISTENER_RULES_CONSENT_VERSION });
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
  const application = result.rows[0];
  const [langs, progress, assessment] = await Promise.all([
    query<{ code: string; proficiency: string }>(`
      SELECT l.code, lal.proficiency::text
      FROM app.listener_application_languages lal
      JOIN app.languages l ON l.id=lal.language_id
      WHERE lal.application_id=$1 ORDER BY l.code
    `, [application.id]),
    query<{ module_key: string; status: string; progress_percent: number; completed_at: string | null }>(`
      SELECT module_key, status::text, progress_percent, completed_at::text
      FROM app.listener_training_progress
      WHERE application_id=$1
    `, [application.id]),
    query<{ id: string; result: string; score: string | null; scenario_version: string; created_at: string }>(`
      SELECT id::text, result::text, score::text, scenario_version, created_at::text
      FROM app.listener_assessment_attempts
      WHERE application_id=$1
      ORDER BY created_at DESC LIMIT 1
    `, [application.id]),
  ]);
  const byModule = new Map(progress.rows.map((row) => [row.module_key, row]));
  const training = LISTENER_TRAINING_MODULES.map((moduleKey) => byModule.get(moduleKey) ?? {
    module_key: moduleKey,
    status: 'not_started',
    progress_percent: 0,
    completed_at: null,
  });
  sendJson(res, 200, {
    ...application,
    languages: langs.rows,
    training,
    trainingComplete: listenerTrainingComplete(training),
    latestAssessment: assessment.rows[0] ?? null,
  });
}
