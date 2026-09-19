import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { legalHoldReviewDueAt } from '../../../../packages/domain/src/recording.ts';
import { requireAdminCapability } from '../lib/admin.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import { RECORDING_ADMIN_CAPABILITY as RECORDING_CAPABILITY } from '../lib/recording-admin-capability.ts';
import { recordingPlaybackGrantTtlSeconds } from '../lib/recording-config.ts';
import {
  getPlaybackResolver,
  PlaybackResolverError,
  type PlaybackResolutionResult,
} from '../providers/recording-playback-resolver.ts';
import { releaseRecordingLegalHold, setRecordingLegalHold } from '../services/recording-lifecycle.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODE_RE = /^[a-z0-9][a-z0-9_-]{1,79}$/;

function assertId(value: string, code: string): string {
  if (!UUID_RE.test(value)) throw new HttpError(400, code);
  return value;
}

function caseKindFrom(value: unknown): 'report' | 'safety_event' {
  if (value === 'report' || value === 'safety_event') return value;
  throw new HttpError(400, 'invalid_safety_case_kind');
}

function reasonCodeFrom(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!REASON_CODE_RE.test(code)) throw new HttpError(400, 'invalid_reason_code');
  return code;
}

async function resolveCaseCallSessionId(caseKind: 'report' | 'safety_event', caseId: string): Promise<string> {
  const { callSessionId } = await resolveSafetyCase(caseKind, caseId);
  return callSessionId;
}

// Also surfaces the case's own resolved_at (set by routes/admin-safety.ts
// when a report/safety_event moves to 'resolved'/'dismissed') so the legal
// hold review-due date (see packages/domain/src/recording.ts
// legalHoldReviewDueAt) can be computed without a second round trip.
async function resolveSafetyCase(
  caseKind: 'report' | 'safety_event',
  caseId: string,
): Promise<{ callSessionId: string; caseResolvedAt: string | null }> {
  const table = caseKind === 'report' ? 'app.reports' : 'app.safety_events';
  const result = await query<{ call_session_id: string | null; resolved_at: string | null }>(
    `SELECT call_session_id::text, resolved_at::text FROM ${table} WHERE id=$1`,
    [caseId],
  );
  const row = result.rows[0];
  if (!row?.call_session_id) throw new HttpError(404, 'safety_case_not_found');
  return { callSessionId: row.call_session_id, caseResolvedAt: row.resolved_at };
}

// Metadata only -- recording ID, lifecycle state, retention/hold. Never a
// storage reference or playback URL: those require an explicit,
// case-linked, audited playback grant (see requestRecordingPlaybackGrant).
export async function getRecordingForSafetyCase(
  req: IncomingMessage,
  res: ServerResponse,
  rawCaseKind: string,
  rawCaseId: string,
) {
  await requireAdminCapability(req, RECORDING_CAPABILITY);
  const caseKind = caseKindFrom(rawCaseKind);
  const caseId = assertId(rawCaseId, 'invalid_safety_case');
  const { callSessionId, caseResolvedAt } = await resolveSafetyCase(caseKind, caseId);

  const result = await query<{
    id: string;
    state: string;
    started_at: string | null;
    ended_at: string | null;
    retention_until: string | null;
    legal_hold: boolean;
    legal_hold_reason_code: string | null;
    failure_code: string | null;
  }>(`
    SELECT id::text, state::text, started_at::text, ended_at::text,
           retention_until::text, legal_hold, legal_hold_reason_code, failure_code
    FROM private_data.call_recording_sessions
    WHERE call_session_id=$1
  `, [callSessionId]);
  const row = result.rows[0];
  if (!row) {
    sendJson(res, 200, { ok: true, callId: callSessionId, recording: null });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    callId: callSessionId,
    recording: {
      id: row.id,
      state: row.state,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      retentionUntil: row.retention_until,
      legalHold: row.legal_hold,
      legalHoldReasonCode: row.legal_hold_reason_code,
      // Informational only (Mission E): when the linked case is closed, the
      // date a still-active hold is due for admin review under the 180-day
      // post-closure policy. null while the case remains open, or when there
      // is no active hold. Never auto-acted on -- see legalHoldReviewDueAt's
      // own doc comment.
      legalHoldReviewDueAt: row.legal_hold && caseResolvedAt
        ? legalHoldReviewDueAt(new Date(caseResolvedAt)).toISOString()
        : null,
      failureCode: row.failure_code,
    },
  });
}

// Short-lived, case-linked, reason-coded, fully audited authorization,
// immediately followed by an attempt to resolve an actual playback URL
// through the provider-neutral resolver boundary (providers/
// recording-playback-resolver.ts). Never returns a long-lived provider token
// or an unrestricted URL -- see that module's header for why the Cloudflare
// RealtimeKit resolver fails closed today (no verified archival-storage
// integration exists in this repo yet).
export async function requestRecordingPlaybackGrant(
  req: IncomingMessage,
  res: ServerResponse,
  rawRecordingSessionId: string,
) {
  const admin = await requireAdminCapability(req, RECORDING_CAPABILITY);
  const recordingSessionId = assertId(rawRecordingSessionId, 'invalid_recording_session');
  const body = await readJson<{ caseKind?: unknown; caseId?: unknown; reasonCode?: unknown }>(req);
  const caseKind = caseKindFrom(body.caseKind);
  const caseId = assertId(typeof body.caseId === 'string' ? body.caseId : '', 'invalid_safety_case');
  const reasonCode = reasonCodeFrom(body.reasonCode);

  const callSessionId = await resolveCaseCallSessionId(caseKind, caseId);

  const grant = await withTransaction(async (client) => {
    const session = await client.query<{
      id: string;
      call_session_id: string;
      provider: string;
      provider_meeting_id: string | null;
      provider_recording_id: string | null;
    }>(`
      SELECT id::text, call_session_id::text, provider, provider_meeting_id, provider_recording_id
      FROM private_data.call_recording_sessions
      WHERE id=$1
      FOR UPDATE
    `, [recordingSessionId]);
    const sessionRow = session.rows[0];
    if (!sessionRow) throw new HttpError(404, 'recording_session_not_found');
    if (sessionRow.call_session_id !== callSessionId) throw new HttpError(409, 'recording_case_mismatch');

    const ttlSeconds = recordingPlaybackGrantTtlSeconds();
    const inserted = await client.query<{ id: string; authorized_at: string; expires_at: string }>(`
      INSERT INTO app.recording_playback_grants(
        admin_user_id, recording_session_id, safety_case_kind, safety_case_id, reason_code, expires_at
      ) VALUES ($1,$2,$3,$4,$5, now() + ($6::text || ' seconds')::interval)
      RETURNING id::text, authorized_at::text, expires_at::text
    `, [admin.userId, recordingSessionId, caseKind, caseId, reasonCode, String(ttlSeconds)]);

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'admin_recording_playback_grant','recording_session',$2,jsonb_build_object(
        'caseKind',$3::text,'caseId',$4::text,'reasonCode',$5::text
      ))
    `, [admin.userId, recordingSessionId, caseKind, caseId, reasonCode]);

    // Fail-closed resolution: any resolver error becomes an 'unavailable'
    // result (with an internal-only code, never surfaced to the client body)
    // rather than a raw 500 or a fabricated URL.
    let resolution: PlaybackResolutionResult;
    try {
      const resolver = await getPlaybackResolver(sessionRow.provider);
      resolution = await resolver.resolvePlayback({
        recordingSessionId,
        provider: sessionRow.provider,
        providerMeetingId: sessionRow.provider_meeting_id,
        providerRecordingId: sessionRow.provider_recording_id,
        ttlSeconds,
      });
    } catch (error) {
      const code = error instanceof PlaybackResolverError ? error.code : 'playback_resolution_failed';
      resolution = { status: 'unavailable', reason: code };
    }

    // Audit the resolution attempt itself (Mission C: "actual playback
    // resolution/access event where practical"), and mark the grant as
    // accessed -- deliberately never includes the URL/token, only status.
    await client.query(`
      UPDATE app.recording_playback_grants SET accessed_at=now() WHERE id=$1
    `, [inserted.rows[0].id]);
    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'admin_recording_playback_resolved','recording_session',$2,jsonb_build_object(
        'grantId',$3::text,'status',$4::text,'reason',$5::text
      ))
    `, [
      admin.userId,
      recordingSessionId,
      inserted.rows[0].id,
      resolution.status,
      resolution.status === 'unavailable' ? resolution.reason : null,
    ]);

    return { ...inserted.rows[0], resolution };
  });

  sendJson(res, 201, {
    ok: true,
    grantId: grant.id,
    recordingSessionId,
    authorizedAt: grant.authorized_at,
    expiresAt: grant.expires_at,
    // playbackUrl stays for existing callers: null unless the resolver
    // actually produced a short-lived URL. `playback` is the structured,
    // fail-closed-aware status new callers (apps/admin) should read instead.
    playbackUrl: grant.resolution.status === 'available' ? grant.resolution.playbackUrl : null,
    playback: grant.resolution.status === 'available'
      ? { status: 'available', expiresAt: grant.resolution.expiresAt }
      : { status: 'unavailable', reason: grant.resolution.reason },
  });
}

export async function setRecordingHold(req: IncomingMessage, res: ServerResponse, rawRecordingSessionId: string) {
  const admin = await requireAdminCapability(req, RECORDING_CAPABILITY);
  const recordingSessionId = assertId(rawRecordingSessionId, 'invalid_recording_session');
  const body = await readJson<{ caseKind?: unknown; caseId?: unknown; reasonCode?: unknown }>(req);
  const caseKind = caseKindFrom(body.caseKind);
  const caseId = assertId(typeof body.caseId === 'string' ? body.caseId : '', 'invalid_safety_case');
  const reasonCode = reasonCodeFrom(body.reasonCode);
  const callSessionId = await resolveCaseCallSessionId(caseKind, caseId);

  const session = await query<{ call_session_id: string }>(`
    SELECT call_session_id::text FROM private_data.call_recording_sessions WHERE id=$1
  `, [recordingSessionId]);
  const sessionRow = session.rows[0];
  if (!sessionRow) throw new HttpError(404, 'recording_session_not_found');
  if (sessionRow.call_session_id !== callSessionId) throw new HttpError(409, 'recording_case_mismatch');

  await setRecordingLegalHold({ recordingSessionId, adminUserId: admin.userId, reasonCode, caseKind, caseId });
  await query(`
    INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1,'admin_recording_hold_set','recording_session',$2,jsonb_build_object('caseKind',$3::text,'caseId',$4::text,'reasonCode',$5::text))
  `, [admin.userId, recordingSessionId, caseKind, caseId, reasonCode]);

  sendJson(res, 200, { ok: true, recordingSessionId, legalHold: true });
}

export async function releaseRecordingHold(req: IncomingMessage, res: ServerResponse, rawRecordingSessionId: string) {
  const admin = await requireAdminCapability(req, RECORDING_CAPABILITY);
  const recordingSessionId = assertId(rawRecordingSessionId, 'invalid_recording_session');

  await releaseRecordingLegalHold({ recordingSessionId, adminUserId: admin.userId });
  await query(`
    INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    VALUES ($1,'admin_recording_hold_released','recording_session',$2,'{}'::jsonb)
  `, [admin.userId, recordingSessionId]);

  sendJson(res, 200, { ok: true, recordingSessionId, legalHold: false });
}
