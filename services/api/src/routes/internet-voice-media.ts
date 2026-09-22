import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';
import { currentCallMediaProvider, realtimeKitVoicePresetName } from '../lib/call-media-config.ts';
import { requireParticipantRecordingConsent } from '../services/recording-lifecycle.ts';
import { ensureCallMediaSession } from '../services/call-media-session.ts';
import { addRealtimeKitMeetingParticipant } from '../providers/recording-realtimekit.ts';

// W60: server-side RealtimeKit participant auth. This is the only place a
// RealtimeKit participant token is minted -- the secret Cloudflare API token
// never leaves this process (task section 5: "RealtimeKit secrets must NEVER
// be in mobile"). Each authenticated call participant gets a short-lived
// token scoped to their own exact call via a deterministic
// customParticipantId (`${callSessionId}:${role}`); a caller can never
// request a listener's (or another call's) token because this route derives
// `role` itself from `app.call_sessions`, never from client input.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = ['routing', 'calling_listener', 'connected'] as const;
const RECORDING_PROVIDER_NAME = 'cloudflare_realtimekit';

type ParticipantRole = 'caller' | 'listener';

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');
}

export async function postInternetVoiceMediaAuth(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);

  if (currentCallMediaProvider() !== 'realtimekit') {
    throw new HttpError(409, 'call_media_provider_not_realtimekit');
  }

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      transport: string | null;
      recording_mode: string;
    }>(`
      SELECT caller_user_id::text, listener_user_id::text, status::text, transport::text, recording_mode::text
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [rawCallId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');

    let role: ParticipantRole;
    if (row.caller_user_id === userId) role = 'caller';
    else if (row.listener_user_id === userId) role = 'listener';
    // A user who is not this call's caller or listener must see the same
    // 404 an unrelated call id would produce -- never a 403 that would
    // confirm the call exists and simply belongs to someone else.
    else throw new HttpError(404, 'call_not_found');

    if (row.transport !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');
    if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
      throw new HttpError(409, 'call_not_active');
    }

    if (row.recording_mode === 'all_with_consent') {
      // Mirrors startInternetVoiceCall's caller-side gate and
      // postInternetVoiceSignal's listener-answer gate (W58): a
      // recording-required call must not let either side obtain live media
      // access without their own recording consent already on record.
      await requireParticipantRecordingConsent(client, rawCallId, userId);
    }

    const mediaSession = await ensureCallMediaSession(client, rawCallId, RECORDING_PROVIDER_NAME);
    return { role, providerMeetingId: mediaSession.providerMeetingId };
  });

  // Outside the transaction/row-lock, same external-I/O-after-commit pattern
  // as startInternetVoiceCall's TURN resolution and the recording provider
  // calls: the Cloudflare request never holds a DB connection+lock open.
  const auth = await addRealtimeKitMeetingParticipant({
    providerMeetingId: result.providerMeetingId,
    customParticipantId: `${rawCallId}:${result.role}`,
    presetName: realtimeKitVoicePresetName(),
  });

  sendJson(res, 200, {
    ok: true,
    callId: rawCallId,
    role: result.role,
    provider: 'realtimekit',
    meetingId: result.providerMeetingId,
    authToken: auth.token,
  });
}
