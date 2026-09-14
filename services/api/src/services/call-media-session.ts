import type { SqlClient } from '../lib/sql-client.ts';
import { getRecordingProvider } from '../providers/recording.ts';

// W60: the one RealtimeKit "meeting" a call's live media (and, when required,
// its recording) both attach to. Deliberately its own table, separate from
// private_data.call_recording_sessions (W58): that table only exists once
// both-party recording consent has been recorded, and it is about recording
// *evidence*. This table is about the media *transport* -- it must exist as
// soon as either participant needs to join, independent of whether recording
// is required for this call at all (a Preview call running
// CALL_MEDIA_PROVIDER=realtimekit with CALL_RECORDING_REQUIRED=false is a
// real, supported combination -- see docs/W60 report "Preview legacy
// behavior").
//
// Meeting *identity maps deterministically to call_session_id* (task section
// 5): app.call_media_sessions is UNIQUE(call_session_id), one row per call,
// ever -- a call never gets a second meeting.

export interface CallMediaSession {
  provider: string;
  providerMeetingId: string;
}

// Idempotent: reuses an existing row's meeting id if one exists; otherwise
// creates a provider meeting and stores it. `provider` here is a
// RecordingProvider name (e.g. 'cloudflare_realtimekit'), the same registry
// services/recording-lifecycle.ts's startRecordingForCall uses -- reusing
// getRecordingProvider() rather than a separate media-provider registry is
// deliberate: RecordingProvider#prepareSession is already provider-agnostic
// "create/reuse the meeting a call's media and recording both attach to"; it
// was never actually recording-specific (see providers/recording.ts). This
// is also what lets startRecordingForCall (W58) and this function (W60)
// converge on the exact same Cloudflare meeting instead of each creating
// their own -- the specific bug this task's section 3 warns must not happen.
//
// Race note: two callers racing on a call's very first media-auth request
// (both see no existing row, both call provider.prepareSession) can each
// create a Cloudflare meeting before either INSERT commits. The
// ON CONFLICT DO NOTHING + re-read below means both callers still converge
// on one canonical stored meeting id; the loser's freshly-created provider
// meeting is simply never referenced again. Harmless and rare enough
// (requires two participant-auth requests for the same call within the same
// sub-second window) that an advisory lock was judged not worth the added
// complexity here.
export async function ensureCallMediaSession(
  client: SqlClient,
  callSessionId: string,
  provider: string,
): Promise<CallMediaSession> {
  const existing = await client.query<{ provider: string; provider_meeting_id: string }>(`
    SELECT provider, provider_meeting_id
    FROM app.call_media_sessions
    WHERE call_session_id=$1
  `, [callSessionId]);
  if (existing.rows[0]) {
    return { provider: existing.rows[0].provider, providerMeetingId: existing.rows[0].provider_meeting_id };
  }

  const providerImpl = await getRecordingProvider(provider);
  const prepared = await providerImpl.prepareSession({ callSessionId });

  await client.query(`
    INSERT INTO app.call_media_sessions(call_session_id, provider, provider_meeting_id)
    VALUES ($1,$2,$3)
    ON CONFLICT (call_session_id) DO NOTHING
  `, [callSessionId, provider, prepared.providerMeetingId]);

  const canonical = await client.query<{ provider: string; provider_meeting_id: string }>(`
    SELECT provider, provider_meeting_id
    FROM app.call_media_sessions
    WHERE call_session_id=$1
  `, [callSessionId]);
  const row = canonical.rows[0];
  if (!row) throw new Error('call_media_session_missing_after_insert');
  return { provider: row.provider, providerMeetingId: row.provider_meeting_id };
}
