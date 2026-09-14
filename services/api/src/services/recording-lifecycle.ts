import type { QueryResultRow } from 'pg';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import {
  canTransitionRecordingState,
  hasBothPartyRecordingConsent,
  isRecordingActiveForBilling,
  purgeEligibleAt as computePurgeEligibleAt,
  type CallParty,
  type RecordingConsentRecord,
  type RecordingState,
} from '../../../../packages/domain/src/recording.ts';
import { getRecordingProvider, RecordingProviderError } from '../providers/recording.ts';
import { currentRecordingPolicy, recordingRetentionDays } from '../lib/recording-config.ts';
import { HttpError } from '../lib/http.ts';

// Deliberately narrower than PoolClient's real (overloaded) `query` type: a
// plain PoolClient and the shared `query` helper each satisfy this single
// signature structurally, which is what lets confirmRecordingActiveForBilling
// and requireParticipantRecordingConsent accept either a transaction's
// PoolClient or the top-level `query` function interchangeably.
export interface SqlClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export const RECORDING_CONFIRMATION_TIMEOUT_SECONDS = (() => {
  const raw = process.env.CALL_RECORDING_CONFIRMATION_TIMEOUT_SECONDS?.trim();
  const value = raw ? Number(raw) : 45;
  if (!Number.isInteger(value) || value < 5 || value > 300) {
    throw new Error('CALL_RECORDING_CONFIRMATION_TIMEOUT_SECONDS must be an integer between 5 and 300');
  }
  return value;
})();

interface RecordingSessionRow {
  id: string;
  state: RecordingState;
  provider: string;
  provider_meeting_id: string | null;
  provider_recording_id: string | null;
  consent_policy_version: string;
  legal_hold: boolean;
}

async function fetchRecordingSessionForUpdate(client: SqlClient, callSessionId: string): Promise<RecordingSessionRow | null> {
  const result = await client.query<RecordingSessionRow>(`
    SELECT id::text, state::text, provider, provider_meeting_id, provider_recording_id,
           consent_policy_version, legal_hold
    FROM private_data.call_recording_sessions
    WHERE call_session_id=$1
    FOR UPDATE
  `, [callSessionId]);
  return result.rows[0] ?? null;
}

async function transitionState(
  client: SqlClient,
  recordingSessionId: string,
  from: RecordingState,
  to: RecordingState,
  extra: { failureCode?: string | null; startedAt?: boolean; endedAt?: boolean } = {},
): Promise<void> {
  if (!canTransitionRecordingState(from, to)) {
    throw new HttpError(409, `recording_state_transition_invalid:${from}->${to}`);
  }
  await client.query(`
    UPDATE private_data.call_recording_sessions
    SET state=$2::app.recording_state,
        failure_code=$3,
        started_at=CASE WHEN $4::boolean THEN COALESCE(started_at, now()) ELSE started_at END,
        ended_at=CASE WHEN $5::boolean THEN COALESCE(ended_at, now()) ELSE ended_at END,
        updated_at=now()
    WHERE id=$1
  `, [recordingSessionId, to, extra.failureCode ?? null, Boolean(extra.startedAt), Boolean(extra.endedAt)]);
}

// ---------------------------------------------------------------------------
// CONSENT
// ---------------------------------------------------------------------------

export async function recordCallRecordingConsent(input: {
  callSessionId: string;
  userId: string;
  role: CallParty;
  locale: string;
  clientVersion: string | null;
}): Promise<{ policyVersion: string; bothPartiesConsented: boolean }> {
  const policy = currentRecordingPolicy();
  if (!policy.required || !policy.policyVersion) {
    // Recording is explicitly disabled here (Internal Preview technical-beta
    // exception). Accept the acknowledgment for UX continuity but do not
    // pretend a recording policy version exists.
    return { policyVersion: 'not_applicable', bothPartiesConsented: true };
  }

  return withTransaction(async (client) => {
    const call = await client.query<{ caller_user_id: string; listener_user_id: string | null }>(`
      SELECT caller_user_id::text, listener_user_id::text
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [input.callSessionId]);
    const callRow = call.rows[0];
    if (!callRow) throw new HttpError(404, 'call_not_found');
    if (callRow.caller_user_id !== input.userId && callRow.listener_user_id !== input.userId) {
      throw new HttpError(404, 'call_not_found');
    }

    await client.query(`
      INSERT INTO app.call_recording_consents(
        call_session_id, user_id, role, consent_type, policy_version, locale, client_version
      ) VALUES ($1,$2,$3,'recording',$4,$5,$6)
      ON CONFLICT (call_session_id, user_id)
      DO UPDATE SET policy_version=EXCLUDED.policy_version, locale=EXCLUDED.locale,
        client_version=EXCLUDED.client_version, accepted_at=now(), revoked_at=NULL
    `, [input.callSessionId, input.userId, input.role, policy.policyVersion, input.locale, input.clientVersion]);

    await client.query(`
      INSERT INTO private_data.call_recording_sessions(call_session_id, provider, state, consent_policy_version)
      VALUES ($1,$2,'consent_pending',$3)
      ON CONFLICT (call_session_id) DO NOTHING
    `, [input.callSessionId, policy.provider, policy.policyVersion]);

    const consents = await client.query<{ role: CallParty; policy_version: string; revoked_at: string | null }>(`
      SELECT role, policy_version, revoked_at::text
      FROM app.call_recording_consents
      WHERE call_session_id=$1
    `, [input.callSessionId]);
    const records: RecordingConsentRecord[] = consents.rows.map((row) => ({
      role: row.role,
      policyVersion: row.policy_version,
      revokedAt: row.revoked_at,
    }));
    const bothPartiesConsented = hasBothPartyRecordingConsent(records, policy.policyVersion as string);

    if (bothPartiesConsented) {
      const session = await fetchRecordingSessionForUpdate(client, input.callSessionId);
      if (session && session.state === 'consent_pending') {
        await transitionState(client, session.id, 'consent_pending', 'ready');
      }
    }

    return { policyVersion: policy.policyVersion as string, bothPartiesConsented };
  });
}

// Single-participant gate, used to refuse ringing (caller) or answering
// (listener) before the other party has necessarily engaged at all -- an
// earlier, cheaper rejection than waiting for the both-party billing gate.
export async function requireParticipantRecordingConsent(
  client: SqlClient,
  callSessionId: string,
  userId: string,
): Promise<void> {
  const policy = currentRecordingPolicy();
  if (!policy.required) return;

  const consent = await client.query<{ revoked_at: string | null }>(`
    SELECT revoked_at::text
    FROM app.call_recording_consents
    WHERE call_session_id=$1 AND user_id=$2 AND policy_version=$3
  `, [callSessionId, userId, policy.policyVersion]);
  const granted = consent.rows[0];
  if (!granted || granted.revoked_at !== null) throw new HttpError(403, 'recording_consent_required');
}

export async function requireBothPartyRecordingConsentForDispatch(callSessionId: string): Promise<void> {
  const policy = currentRecordingPolicy();
  if (!policy.required) return;

  const consents = await query<{ role: CallParty; policy_version: string; revoked_at: string | null }>(`
    SELECT role, policy_version, revoked_at::text
    FROM app.call_recording_consents
    WHERE call_session_id=$1
  `, [callSessionId]);
  const records: RecordingConsentRecord[] = consents.rows.map((row) => ({
    role: row.role,
    policyVersion: row.policy_version,
    revokedAt: row.revoked_at,
  }));
  if (!hasBothPartyRecordingConsent(records, policy.policyVersion as string)) {
    throw new HttpError(403, 'recording_consent_required');
  }
}

// ---------------------------------------------------------------------------
// PROVIDER ORCHESTRATION
// ---------------------------------------------------------------------------

// Idempotent: safe to call repeatedly (e.g. once per ringing attempt). Only
// acts when the recording session is still 'ready'; a session already
// starting/recording/stopped is left untouched and its current DB state is
// returned instead of re-invoking the provider.
export async function startRecordingForCall(callSessionId: string, maxSeconds: number): Promise<RecordingState> {
  const policy = currentRecordingPolicy();
  if (!policy.required) return 'not_requested';

  return withTransaction(async (client) => {
    const session = await fetchRecordingSessionForUpdate(client, callSessionId);
    if (!session) throw new HttpError(409, 'recording_consent_required');
    if (session.state !== 'ready') return session.state;

    const provider = await getRecordingProvider(session.provider);
    try {
      let providerMeetingId = session.provider_meeting_id;
      if (!providerMeetingId) {
        const prepared = await provider.prepareSession({ callSessionId });
        providerMeetingId = prepared.providerMeetingId;
      }
      const started = await provider.startRecording({ providerMeetingId, maxSeconds });
      const normalized = provider.normalizeStatus(started.providerStatus);
      await client.query(`
        UPDATE private_data.call_recording_sessions
        SET provider_meeting_id=$2, provider_recording_id=$3, updated_at=now()
        WHERE id=$1
      `, [session.id, providerMeetingId, started.providerRecordingId]);
      await transitionState(client, session.id, 'ready', 'starting');
      if (normalized === 'recording') {
        await transitionState(client, session.id, 'starting', 'recording', { startedAt: true });
        return 'recording';
      }
      return 'starting';
    } catch (error) {
      const code = error instanceof RecordingProviderError ? error.code : 'recording_start_failed';
      await transitionState(client, session.id, session.state === 'ready' ? 'ready' : 'starting', 'failed', { failureCode: code });
      return 'failed';
    }
  });
}

// Authoritative confirmation used by the billing gate. Never returns true
// from anything other than a freshly-confirmed (or already-confirmed)
// `recording` state -- an HTTP 200 from startRecordingForCall alone is not
// sufficient. Runs inside the caller's own transaction/row-lock so the
// billing UPDATE that follows sees a consistent, just-confirmed state.
export async function confirmRecordingActiveForBilling(
  client: SqlClient,
  callSessionId: string,
): Promise<{ active: boolean; state: RecordingState }> {
  const policy = currentRecordingPolicy();
  if (!policy.required) return { active: true, state: 'not_requested' };

  const session = await fetchRecordingSessionForUpdate(client, callSessionId);
  if (!session) return { active: false, state: 'not_requested' };
  if (isRecordingActiveForBilling(session.state)) return { active: true, state: session.state };
  if (session.state === 'failed' || session.state === 'held' || session.state === 'purged') {
    return { active: false, state: session.state };
  }
  if (!session.provider_meeting_id || !session.provider_recording_id) {
    return { active: false, state: session.state };
  }

  try {
    const provider = await getRecordingProvider(session.provider);
    const status = await provider.getRecordingStatus({
      providerMeetingId: session.provider_meeting_id,
      providerRecordingId: session.provider_recording_id,
    });
    const normalized = provider.normalizeStatus(status.providerStatus);
    if (normalized === 'recording') {
      const from = session.state === 'starting' ? 'starting' : session.state;
      if (canTransitionRecordingState(from, 'recording')) {
        await transitionState(client, session.id, from, 'recording', { startedAt: true });
      }
      return { active: true, state: 'recording' };
    }
    if (normalized === 'failed') {
      await transitionState(client, session.id, session.state, 'failed', { failureCode: status.failureCode ?? 'recording_provider_errored' });
      return { active: false, state: 'failed' };
    }
    return { active: false, state: session.state };
  } catch (error) {
    const code = error instanceof RecordingProviderError ? error.code : 'recording_status_check_failed';
    if (canTransitionRecordingState(session.state, 'failed')) {
      await transitionState(client, session.id, session.state, 'failed', { failureCode: code });
    }
    return { active: false, state: 'failed' };
  }
}

// Idempotent stop: no-op unless the recording is actually in an active
// (starting/recording) state.
export async function stopRecordingForCall(callSessionId: string): Promise<RecordingState> {
  return withTransaction(async (client) => {
    const session = await fetchRecordingSessionForUpdate(client, callSessionId);
    if (!session) return 'not_requested';
    if (session.state !== 'starting' && session.state !== 'recording') return session.state;
    if (!session.provider_meeting_id || !session.provider_recording_id) {
      await transitionState(client, session.id, session.state, 'failed', { failureCode: 'recording_missing_provider_ids' });
      return 'failed';
    }

    try {
      const provider = await getRecordingProvider(session.provider);
      const stopped = await provider.stopRecording({
        providerMeetingId: session.provider_meeting_id,
        providerRecordingId: session.provider_recording_id,
      });
      const normalized = provider.normalizeStatus(stopped.providerStatus);
      const target: RecordingState = normalized === 'stored' ? 'stored' : normalized === 'uploading' ? 'uploading' : 'stopping';
      await transitionState(client, session.id, session.state, target, { endedAt: true });
      if (target === 'stored') {
        const retentionUntil = computePurgeEligibleAt(new Date(), recordingRetentionDays());
        await client.query(`
          UPDATE private_data.call_recording_sessions
          SET retention_until=$2, purge_eligible_at=$2
          WHERE id=$1
        `, [session.id, retentionUntil.toISOString()]);
      }
      return target;
    } catch (error) {
      const code = error instanceof RecordingProviderError ? error.code : 'recording_stop_failed';
      await transitionState(client, session.id, session.state, 'failed', { failureCode: code, endedAt: true });
      return 'failed';
    }
  });
}

export async function recordingConfirmationDeadlinePassed(connectedAt: Date): Promise<boolean> {
  return Date.now() - connectedAt.getTime() > RECORDING_CONFIRMATION_TIMEOUT_SECONDS * 1_000;
}

export type HeartbeatRecordingOutcome = 'not_applicable' | 'already_billing' | 'billing_started' | 'still_waiting' | 'timeout';

// Called from the existing 5s Internet Voice heartbeat poll (routes/
// internet-voice-heartbeat.ts). A recording-required call that connected but
// whose recording has not yet been confirmed active gets re-checked on every
// heartbeat; once RECORDING_CONFIRMATION_TIMEOUT_SECONDS have passed since
// connected_at without confirmation, the caller is told to end the call with
// zero charge rather than let it continue indefinitely unbilled and
// unrecorded. This is the "safest deterministic state transition" for a
// public recording-required call whose recording never became active.
export async function reconcileRecordingForHeartbeat(callSessionId: string): Promise<HeartbeatRecordingOutcome> {
  return withTransaction(async (client) => {
    const call = await client.query<{
      status: string;
      recording_mode: string;
      billing_started_at: string | null;
      connected_at: string | null;
    }>(`
      SELECT status::text, recording_mode::text, billing_started_at::text, connected_at::text
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [callSessionId]);
    const row = call.rows[0];
    if (!row || row.status !== 'connected' || row.recording_mode !== 'all_with_consent') return 'not_applicable';
    if (row.billing_started_at) return 'already_billing';
    if (!row.connected_at) return 'not_applicable';

    const gate = await confirmRecordingActiveForBilling(client, callSessionId);
    if (gate.active) {
      await client.query(`
        UPDATE app.call_sessions
        SET billing_started_at=COALESCE(billing_started_at, now()), updated_at=now()
        WHERE id=$1 AND status='connected'
      `, [callSessionId]);
      return 'billing_started';
    }

    const connectedAt = new Date(row.connected_at);
    if (await recordingConfirmationDeadlinePassed(connectedAt)) return 'timeout';
    return 'still_waiting';
  });
}

// ---------------------------------------------------------------------------
// HOLD / RETENTION
// ---------------------------------------------------------------------------

export async function setRecordingLegalHold(input: {
  recordingSessionId: string;
  adminUserId: string;
  reasonCode: string;
  caseKind: 'report' | 'safety_event';
  caseId: string;
}): Promise<void> {
  await query(`
    UPDATE private_data.call_recording_sessions
    SET legal_hold=true,
        legal_hold_reason_code=$2,
        legal_hold_case_kind=$3,
        legal_hold_case_id=$4,
        legal_hold_set_by=$5,
        legal_hold_set_at=now(),
        legal_hold_released_by=NULL,
        legal_hold_released_at=NULL,
        updated_at=now()
    WHERE id=$1
  `, [input.recordingSessionId, input.reasonCode, input.caseKind, input.caseId, input.adminUserId]);
}

// Idempotent + reversible: releasing an already-released hold is a no-op.
export async function releaseRecordingLegalHold(input: {
  recordingSessionId: string;
  adminUserId: string;
}): Promise<void> {
  await query(`
    UPDATE private_data.call_recording_sessions
    SET legal_hold=false,
        legal_hold_released_by=$2,
        legal_hold_released_at=now(),
        updated_at=now()
    WHERE id=$1 AND legal_hold=true
  `, [input.recordingSessionId, input.adminUserId]);
}

export interface PurgeEligibleRecordingSession {
  id: string;
  callSessionId: string;
  purgeEligibleAt: string;
}

// Read-only: lists sessions that WOULD be purged. The actual destructive
// purge job stays disabled until archival storage is integrated (task
// section 12); this exists so the eligibility model and tests are ready.
export async function listPurgeEligibleRecordingSessions(now: Date = new Date()): Promise<PurgeEligibleRecordingSession[]> {
  const result = await query<{ id: string; call_session_id: string; purge_eligible_at: string }>(`
    SELECT id::text, call_session_id::text, purge_eligible_at::text
    FROM private_data.call_recording_sessions
    WHERE purge_eligible_at IS NOT NULL
      AND purge_eligible_at <= $1
      AND purged_at IS NULL
      AND legal_hold = false
  `, [now.toISOString()]);
  return result.rows.map((row) => ({ id: row.id, callSessionId: row.call_session_id, purgeEligibleAt: row.purge_eligible_at }));
}
