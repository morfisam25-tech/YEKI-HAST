import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';
import { sessionTiming } from '../domain/session-policy.ts';
import { settleInternetVoiceCall } from '../services/internet-voice-lifecycle.ts';
import { reconcileRecordingForHeartbeat } from '../services/recording-lifecycle.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set(['completed', 'missed', 'cancelled', 'failed', 'safety_terminated']);

type ParticipantRole = 'caller' | 'listener';

export async function heartbeatInternetVoiceCall(
  req: IncomingMessage,
  res: ServerResponse,
  rawCallId: string,
) {
  if (!UUID_RE.test(rawCallId)) throw new HttpError(400, 'invalid_call');
  const { userId } = await requireAuth(req);

  const result = await query<{
    id: string;
    caller_user_id: string;
    listener_user_id: string | null;
    status: string;
    transport: string | null;
    connected_at: string | null;
    max_billable_seconds: number | null;
    ended_reason: string | null;
  }>(`
    SELECT id::text, caller_user_id::text, listener_user_id::text,
           status::text, transport::text, connected_at::text, max_billable_seconds, ended_reason
    FROM app.call_sessions
    WHERE id=$1
  `, [rawCallId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'call_not_found');
  if (row.transport !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');

  let role: ParticipantRole;
  if (row.caller_user_id === userId) role = 'caller';
  else if (row.listener_user_id === userId) role = 'listener';
  else throw new HttpError(403, 'not_call_participant');

  if (row.status === 'connected') {
    const heartbeatColumn = role === 'caller' ? 'caller_voice_heartbeat_at' : 'listener_voice_heartbeat_at';
    const updated = await query(`
      UPDATE app.call_sessions
      SET ${heartbeatColumn}=now(), updated_at=now()
      WHERE id=$1 AND status='connected' AND transport='internet_voice'
      RETURNING id
    `, [row.id]);
    if (!updated.rowCount) throw new HttpError(409, 'call_not_live');

    // A recording-required call can be 'connected' (media is live) while
    // still unbilled because recording has not yet been authoritatively
    // confirmed active -- see the media_connected billing gate in
    // routes/internet-voice.ts. Re-check on every heartbeat, and enforce the
    // bounded confirmation timeout deterministically here.
    const recordingOutcome = await reconcileRecordingForHeartbeat(row.id);
    if (recordingOutcome === 'timeout') {
      const settlement = await settleInternetVoiceCall({
        callId: row.id,
        endedByRole: role,
        endedReason: 'recording_confirmation_timeout',
      });
      sendJson(res, 200, {
        ok: true,
        callId: row.id,
        transport: 'internet_voice',
        status: settlement.status,
        terminal: true,
        capReached: false,
        recordingConfirmationTimeout: true,
        timing: { elapsedConnectedSeconds: 0, remainingSeconds: 0, warningThresholdsSeconds: [120, 60], warning: null },
        settlement,
      });
      return;
    }
  }

  if (TERMINAL_STATUSES.has(row.status)) {
    const capReached = row.ended_reason === 'internet_voice_session_cap_reached';
    sendJson(res, 200, {
      ok: true,
      callId: row.id,
      transport: 'internet_voice',
      status: row.status,
      terminal: true,
      capReached,
      timing: {
        elapsedConnectedSeconds: capReached ? row.max_billable_seconds ?? 0 : 0,
        remainingSeconds: 0,
        warningThresholdsSeconds: [120, 60],
        warning: null,
      },
    });
    return;
  }

  const timing = sessionTiming({
    status: row.status,
    connectedAt: row.connected_at,
    maxBillableSeconds: row.max_billable_seconds,
  });

  if (row.status === 'connected' && timing.remainingSeconds === 0) {
    const settlement = await settleInternetVoiceCall({
      callId: row.id,
      endedByRole: role,
      endedReason: 'internet_voice_session_cap_reached',
    });
    sendJson(res, 200, {
      ok: true,
      callId: row.id,
      transport: 'internet_voice',
      status: settlement.status,
      terminal: true,
      capReached: true,
      timing,
      settlement,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    callId: row.id,
    transport: 'internet_voice',
    status: row.status,
    terminal: false,
    capReached: false,
    timing,
  });
}