import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import { currentRecordingPolicy } from '../lib/recording-config.ts';
import { recordCallRecordingConsent } from '../services/recording-lifecycle.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');
}

function localeFrom(value: unknown): string {
  const locale = typeof value === 'string' ? value.trim() : '';
  if (!LOCALE_RE.test(locale)) throw new HttpError(400, 'invalid_locale');
  return locale;
}

function clientVersionFrom(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 60) throw new HttpError(400, 'invalid_client_version');
  return value;
}

export async function postCallRecordingConsent(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);
  const body = await readJson<{ acknowledged?: unknown; locale?: unknown; clientVersion?: unknown }>(req);
  if (body.acknowledged !== true) throw new HttpError(400, 'recording_acknowledgment_required');
  const locale = localeFrom(body.locale);
  const clientVersion = clientVersionFrom(body.clientVersion);

  const call = await query<{ caller_user_id: string; listener_user_id: string | null }>(`
    SELECT caller_user_id::text, listener_user_id::text
    FROM app.call_sessions
    WHERE id=$1
  `, [rawCallId]);
  const row = call.rows[0];
  if (!row) throw new HttpError(404, 'call_not_found');
  const role = row.caller_user_id === userId ? 'caller' as const
    : row.listener_user_id === userId ? 'listener' as const
      : null;
  if (!role) throw new HttpError(404, 'call_not_found');

  const result = await recordCallRecordingConsent({ callSessionId: rawCallId, userId, role, locale, clientVersion });
  sendJson(res, 200, {
    ok: true,
    callId: rawCallId,
    role,
    policyVersion: result.policyVersion,
    bothPartiesConsented: result.bothPartiesConsented,
  });
}

export async function getCallRecordingStatus(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);
  const policy = currentRecordingPolicy();

  const call = await query<{ caller_user_id: string; listener_user_id: string | null; recording_mode: string }>(`
    SELECT caller_user_id::text, listener_user_id::text, recording_mode::text
    FROM app.call_sessions
    WHERE id=$1
  `, [rawCallId]);
  const row = call.rows[0];
  if (!row) throw new HttpError(404, 'call_not_found');
  if (row.caller_user_id !== userId && row.listener_user_id !== userId) throw new HttpError(404, 'call_not_found');

  const consents = await query<{ role: string }>(`
    SELECT role::text
    FROM app.call_recording_consents
    WHERE call_session_id=$1 AND revoked_at IS NULL AND policy_version=$2
  `, [rawCallId, policy.policyVersion ?? '']);
  const consentedRoles = new Set(consents.rows.map((consentRow) => consentRow.role));

  sendJson(res, 200, {
    ok: true,
    callId: rawCallId,
    required: row.recording_mode === 'all_with_consent',
    policyVersion: policy.policyVersion,
    callerConsented: consentedRoles.has('caller'),
    listenerConsented: consentedRoles.has('listener'),
  });
}
