import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { listenerTrainingComplete } from '../domain/listener-onboarding.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const applicationStatuses = new Set([
  'exploring', 'training', 'assessment', 'assessment_passed', 'kyc_pending', 'kyc_expired',
  'agreement_pending', 'admin_review', 'mock_call', 'approved', 'active', 'suspended',
  'rejected', 'archived',
]);

function limitFrom(value: string | null): number {
  const parsed = value ? Number(value) : 30;
  if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(400, 'invalid_limit');
  return Math.min(parsed, 100);
}

function idFrom(value: string, code: string): string {
  if (!UUID_RE.test(value)) throw new HttpError(400, code);
  return value;
}

export async function getAdminOperationsSummary(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);

  const result = await query<{
    applications: string;
    awaiting_assessment: string;
    kyc_pending: string;
    approved_listeners: string;
    online_now: string;
    live_calls: string;
    safety_events: string;
    caller_waitlist: string;
    payouts_ready: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM app.listener_applications)::text applications,
      (SELECT COUNT(*) FROM app.listener_applications WHERE status='assessment')::text awaiting_assessment,
      (SELECT COUNT(*) FROM app.listener_applications WHERE status IN ('assessment_passed','kyc_pending','kyc_expired'))::text kyc_pending,
      (SELECT COUNT(*) FROM app.listener_applications WHERE status IN ('approved','active'))::text approved_listeners,
      (
        SELECT COUNT(*)
        FROM app.listener_presence p
        JOIN app.listener_applications la ON la.user_id=p.listener_user_id
        JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
        JOIN app.listener_profiles lp ON lp.user_id=p.listener_user_id
        LEFT JOIN private_data.listener_kyc k ON k.user_id=p.listener_user_id
        WHERE p.status='online'
          AND p.last_heartbeat_at > now() - interval '90 seconds'
          AND la.status IN ('approved','active')
          AND lp.is_verified=true
          AND k.status='verified'
      )::text online_now,
      (
        SELECT COUNT(*) FROM app.call_sessions
        WHERE status IN ('requested','routing','calling_caller','caller_answered','calling_listener','connected')
      )::text live_calls,
      (SELECT COUNT(*) FROM app.safety_events)::text safety_events,
      (SELECT COUNT(*) FROM app.waitlist_entries)::text caller_waitlist,
      (SELECT COUNT(*) FROM app.payouts WHERE status='created')::text payouts_ready
  `);

  const row = result.rows[0];
  sendJson(res, 200, {
    generatedAt: new Date().toISOString(),
    counts: {
      applications: Number(row.applications),
      awaitingAssessment: Number(row.awaiting_assessment),
      kycPending: Number(row.kyc_pending),
      approvedListeners: Number(row.approved_listeners),
      onlineNow: Number(row.online_now),
      liveCalls: Number(row.live_calls),
      safetyEvents: Number(row.safety_events),
      callerWaitlist: Number(row.caller_waitlist),
      payoutsReady: Number(row.payouts_ready),
    },
  });
}

export async function listListenerApplications(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rawStatus = url.searchParams.get('status');
  const status = rawStatus && rawStatus !== 'all' ? rawStatus : null;
  if (status && !applicationStatuses.has(status)) throw new HttpError(400, 'invalid_application_status');
  const limit = limitFrom(url.searchParams.get('limit'));

  const result = await query<{
    id: string; user_id: string; status: string; nickname: string; declared_gender: string;
    short_intro: string | null; listening_style: string | null; submitted_at: string | null;
    created_at: string; latest_attempt_id: string | null; assessment_result: string | null;
    assessment_score: string | null; assessment_created_at: string | null;
  }>(`
    SELECT la.id::text, la.user_id::text, la.status::text, la.nickname,
           la.declared_gender::text, la.short_intro, la.listening_style,
           la.submitted_at::text, la.created_at::text,
           a.id::text latest_attempt_id, a.result::text assessment_result,
           a.score::text assessment_score, a.created_at::text assessment_created_at
    FROM app.listener_applications la
    JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
    LEFT JOIN LATERAL (
      SELECT id, result, score, created_at
      FROM app.listener_assessment_attempts
      WHERE application_id=la.id
      ORDER BY created_at DESC
      LIMIT 1
    ) a ON true
    WHERE ($1::text IS NULL OR la.status::text=$1)
    ORDER BY COALESCE(la.submitted_at, la.created_at), la.created_at
    LIMIT $2
  `, [status, limit]);

  sendJson(res, 200, { applications: result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    nickname: row.nickname,
    gender: row.declared_gender,
    shortIntro: row.short_intro,
    listeningStyle: row.listening_style,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    latestAssessment: row.latest_attempt_id ? {
      id: row.latest_attempt_id,
      result: row.assessment_result,
      score: row.assessment_score === null ? null : Number(row.assessment_score),
      createdAt: row.assessment_created_at,
    } : null,
  })) });
}

export async function getListenerApplicationForAdmin(req: IncomingMessage, res: ServerResponse, rawApplicationId: string) {
  await requireAdmin(req);
  const applicationId = idFrom(rawApplicationId, 'invalid_application');
  const application = await query<{
    id: string; user_id: string; status: string; nickname: string; declared_gender: string;
    short_intro: string | null; listening_style: string | null; submitted_at: string | null;
    created_at: string;
  }>(`
    SELECT la.id::text, la.user_id::text, la.status::text, la.nickname,
           la.declared_gender::text, la.short_intro, la.listening_style,
           la.submitted_at::text, la.created_at::text
    FROM app.listener_applications la
    JOIN app.service_catalog s ON s.id=la.service_id AND s.code='human_listening'
    WHERE la.id=$1
  `, [applicationId]);
  const row = application.rows[0];
  if (!row) throw new HttpError(404, 'listener_application_not_found');

  const [languages, training, assessments] = await Promise.all([
    query<{ code: string; name_fa: string; name_en: string | null; proficiency: string }>(`
      SELECT l.code, l.name_fa, l.name_en, lal.proficiency::text
      FROM app.listener_application_languages lal
      JOIN app.languages l ON l.id=lal.language_id
      WHERE lal.application_id=$1 ORDER BY l.code
    `, [applicationId]),
    query<{ module_key: string; status: string; progress_percent: number; completed_at: string | null }>(`
      SELECT module_key, status::text, progress_percent, completed_at::text
      FROM app.listener_training_progress
      WHERE application_id=$1 ORDER BY module_key
    `, [applicationId]),
    query<{ id: string; result: string; score: string | null; scenario_version: string; answers: unknown; reviewed_by_user_id: string | null; reviewed_at: string | null; created_at: string }>(`
      SELECT id::text, result::text, score::text, scenario_version, answers,
             reviewed_by_user_id::text, reviewed_at::text, created_at::text
      FROM app.listener_assessment_attempts
      WHERE application_id=$1 ORDER BY created_at DESC
      LIMIT 20
    `, [applicationId]),
  ]);

  sendJson(res, 200, {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    nickname: row.nickname,
    gender: row.declared_gender,
    shortIntro: row.short_intro,
    listeningStyle: row.listening_style,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    languages: languages.rows.map((lang) => ({
      code: lang.code, nameFa: lang.name_fa, nameEn: lang.name_en, proficiency: lang.proficiency,
    })),
    training: training.rows,
    assessments: assessments.rows.map((attempt) => ({
      id: attempt.id,
      result: attempt.result,
      score: attempt.score === null ? null : Number(attempt.score),
      scenarioVersion: attempt.scenario_version,
      answers: attempt.answers,
      reviewedByUserId: attempt.reviewed_by_user_id,
      reviewedAt: attempt.reviewed_at,
      createdAt: attempt.created_at,
    })),
  });
}

export async function reviewListenerAssessment(req: IncomingMessage, res: ServerResponse, rawAttemptId: string) {
  const admin = await requireAdmin(req);
  const attemptId = idFrom(rawAttemptId, 'invalid_assessment_attempt');
  const body = await readJson<{ result?: unknown; score?: unknown }>(req);
  if (body.result !== 'passed' && body.result !== 'failed') throw new HttpError(400, 'invalid_assessment_result');
  const result = body.result;
  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new HttpError(400, 'invalid_assessment_score');

  const reviewed = await withTransaction(async (client) => {
    const attempt = await client.query<{
      id: string; result: string; application_id: string; application_status: string;
    }>(`
      SELECT a.id::text, a.result::text, a.application_id::text,
             la.status::text application_status
      FROM app.listener_assessment_attempts a
      JOIN app.listener_applications la ON la.id=a.application_id
      WHERE a.id=$1
      FOR UPDATE OF a, la
    `, [attemptId]);
    const row = attempt.rows[0];
    if (!row) throw new HttpError(404, 'assessment_attempt_not_found');
    if (row.result !== 'pending') throw new HttpError(409, 'assessment_already_reviewed');
    if (row.application_status !== 'assessment') throw new HttpError(409, 'application_not_in_assessment');

    const training = await client.query<{ module_key: string; status: string; progress_percent: number }>(`
      SELECT module_key, status::text, progress_percent
      FROM app.listener_training_progress
      WHERE application_id=$1
    `, [row.application_id]);
    if (!listenerTrainingComplete(training.rows)) throw new HttpError(409, 'training_incomplete');

    const newer = await client.query(`
      SELECT 1
      FROM app.listener_assessment_attempts newer
      JOIN app.listener_assessment_attempts current ON current.id=$1
      WHERE newer.application_id=current.application_id AND newer.created_at>current.created_at
      LIMIT 1
    `, [attemptId]);
    if (newer.rowCount) throw new HttpError(409, 'assessment_attempt_superseded');

    await client.query(`
      UPDATE app.listener_assessment_attempts
      SET result=$2, score=$3, reviewed_by_user_id=$4, reviewed_at=now()
      WHERE id=$1
    `, [attemptId, result, score, admin.userId]);

    const nextStatus = result === 'passed' ? 'assessment_passed' : 'assessment';
    await client.query(`
      UPDATE app.listener_applications
      SET status=$2, updated_at=now()
      WHERE id=$1
    `, [row.application_id, nextStatus]);

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'listener_assessment_reviewed','listener_assessment_attempt',$2,
              jsonb_build_object('result',$3,'score',$4,'applicationId',$5,'adminRole',$6))
    `, [admin.userId, attemptId, result, score, row.application_id, admin.adminRole]);

    return { applicationId: row.application_id, result, score, applicationStatus: nextStatus };
  });

  sendJson(res, 200, { ok: true, attemptId, ...reviewed });
}