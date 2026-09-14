import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import { encryptPrivateText } from '../lib/security.ts';
import { settleInternetVoiceCall } from '../services/internet-voice-lifecycle.ts';
import { stopRecordingForCall } from '../services/recording-lifecycle.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRE_CONNECTED_STATUSES = new Set(['routing', 'calling_listener']);

type ParticipantRole = 'caller' | 'listener';

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');
}

function detailsFrom(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_details');
  const details = value.trim();
  if (!details) return null;
  if (details.length > 4_000) throw new HttpError(400, 'details_too_long');
  return details;
}

function endedReasonFrom(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_end_reason');
  const reason = value.trim();
  if (!reason || reason.length > 120) throw new HttpError(400, 'invalid_end_reason');
  return reason;
}

async function prepareVoiceEnd(input: {
  callId: string;
  userId: string;
  safety: boolean;
  details: string | null;
  blockCounterparty: boolean;
  endedReason: string;
}) {
  return withTransaction(async (client) => {
    const result = await client.query<{
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      transport: string | null;
      currency_code: string;
      authorized_minor: string;
    }>(`
      SELECT caller_user_id::text, listener_user_id::text, status::text, transport::text,
             currency_code, authorized_minor::text
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [input.callId]);
    const row = result.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    if (row.transport !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');

    let role: ParticipantRole;
    let otherUserId: string | null;
    if (row.caller_user_id === input.userId) {
      role = 'caller';
      otherUserId = row.listener_user_id;
    } else if (row.listener_user_id === input.userId) {
      role = 'listener';
      otherUserId = row.caller_user_id;
    } else {
      throw new HttpError(403, 'not_call_participant');
    }

    if (row.status === 'completed' || row.status === 'cancelled' || row.status === 'safety_terminated') {
      return {
        kind: 'terminal' as const,
        role,
        status: row.status,
        safetyEventId: null as string | null,
      };
    }

    let safetyEventId: string | null = null;
    let safetyCutoffAt: string | null = null;
    if (input.safety) {
      // The call row is already locked. Reuse an earlier in-flight Safety Exit event so
      // concurrent retries cannot create multiple safety events before settlement commits.
      const priorEvent = await client.query<{ id: string; created_at: string }>(`
        SELECT id::text, created_at::text
        FROM app.safety_events
        WHERE call_session_id=$1 AND action_code='end_for_safety'
        ORDER BY created_at, id
        LIMIT 1
      `, [input.callId]);
      let event = priorEvent.rows[0];
      const createdEvent = !event;
      if (!event) {
        const inserted = await client.query<{ id: string; created_at: string }>(`
          INSERT INTO app.safety_events(call_session_id, triggered_by, trigger_user_id, severity, action_code)
          VALUES ($1,$2,$3,'high','end_for_safety')
          RETURNING id::text, created_at::text
        `, [input.callId, role, input.userId]);
        event = inserted.rows[0];
      }
      safetyEventId = event.id;
      safetyCutoffAt = event.created_at;
      if (input.details && createdEvent) {
        await client.query(`
          INSERT INTO private_data.safety_event_details(safety_event_id, details_ciphertext)
          VALUES ($1,$2)
        `, [safetyEventId, encryptPrivateText(input.details, `safety_event_details:${safetyEventId}`)]);
      }
      if (input.blockCounterparty && otherUserId) {
        await client.query(`
          INSERT INTO app.blocks(blocker_user_id, blocked_user_id, reason_code)
          VALUES ($1,$2,'safety_exit')
          ON CONFLICT (blocker_user_id, blocked_user_id) DO UPDATE SET
            reason_code=EXCLUDED.reason_code, expires_at=NULL
        `, [input.userId, otherUserId]);
      }
    }

    if (PRE_CONNECTED_STATUSES.has(row.status)) {
      const authorized = BigInt(row.authorized_minor);
      let releasedWalletId: string | null = null;
      if (authorized > 0n) {
        const released = await client.query<{ id: string }>(`
          UPDATE app.wallets
          SET reserved_minor=reserved_minor-$3::bigint, version=version+1, updated_at=now()
          WHERE user_id=$1 AND currency_code=$2 AND reserved_minor >= $3::bigint
          RETURNING id::text
        `, [row.caller_user_id, row.currency_code, authorized.toString()]);
        if (!released.rowCount) throw new HttpError(409, 'wallet_release_conflict');
        releasedWalletId = released.rows[0].id;
      }
      const finalStatus = input.safety ? 'safety_terminated' : 'cancelled';
      await client.query(`
        UPDATE app.call_sessions
        SET status=$2::app.call_status, ended_at=COALESCE(ended_at,now()), ended_reason=$3, updated_at=now()
        WHERE id=$1 AND status::text = ANY($4::text[]) AND transport='internet_voice'
      `, [input.callId, finalStatus, input.endedReason, [...PRE_CONNECTED_STATUSES]]);
      if (releasedWalletId && authorized > 0n) {
        await client.query(`
          INSERT INTO app.wallet_hold_events(
            wallet_id, call_session_id, currency_code, event_type,
            amount_minor, reason_code, idempotency_key, metadata
          ) VALUES ($1,$2,$3,'release',$4,$5,$6,$7::jsonb)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [
          releasedWalletId,
          input.callId,
          row.currency_code,
          authorized.toString(),
          input.safety ? 'preconnect_safety_exit' : 'preconnect_user_cancel',
          `call:${input.callId}:hold:release:preconnect`,
          JSON.stringify({ status: finalStatus, endedByRole: role }),
        ]);
      }
      await client.query(`
        INSERT INTO app.call_events(call_session_id, status, source, metadata)
        VALUES ($1,$2::app.call_status,'api',$3::jsonb)
      `, [input.callId, finalStatus, JSON.stringify({
        reason: input.endedReason,
        transport: 'internet_voice',
        endedByRole: role,
        holdReleased: true,
        holdReleasedMinor: authorized.toString(),
        chargedMinor: '0',
        safetyEventId,
      })]);
      await client.query('DELETE FROM app.internet_voice_signals WHERE call_session_id=$1', [input.callId]);
      return {
        kind: 'preconnected_finalized' as const,
        role,
        status: finalStatus,
        safetyEventId,
      };
    }

    if (row.status !== 'connected') throw new HttpError(409, 'call_not_live');

    // A failed reconnect and the server liveness sweeper must settle at the same
    // server-owned cutoff. An unresolved reconnecting signal activates the heartbeat
    // cutoff; a later reconnected signal from the same sender clears it. Safety Exit
    // additionally supplies its own server timestamp, and settlement uses whichever
    // valid cutoff happened first so no post-safety interval can be billed.
    const disconnect = await client.query<{ effective_end_at: string | null }>(`
      WITH reconnect AS (
        SELECT EXISTS (
          SELECT 1
          FROM app.internet_voice_signals reconnecting
          WHERE reconnecting.call_session_id=$1
            AND reconnecting.sender_role <> $2
            AND reconnecting.signal_kind='reconnecting'
            AND NOT EXISTS (
              SELECT 1
              FROM app.internet_voice_signals recovered
              WHERE recovered.call_session_id=reconnecting.call_session_id
                AND recovered.sender_role=reconnecting.sender_role
                AND recovered.signal_kind='reconnected'
                AND recovered.created_at > reconnecting.created_at
            )
        ) AS unresolved
      )
      SELECT CASE
        WHEN $3::timestamptz IS NOT NULL AND reconnect.unresolved THEN LEAST(
          $3::timestamptz,
          LEAST(
            COALESCE(cs.caller_voice_heartbeat_at,cs.connected_at),
            COALESCE(cs.listener_voice_heartbeat_at,cs.connected_at)
          )
        )::text
        WHEN $3::timestamptz IS NOT NULL THEN $3::timestamptz::text
        WHEN reconnect.unresolved THEN LEAST(
          COALESCE(cs.caller_voice_heartbeat_at,cs.connected_at),
          COALESCE(cs.listener_voice_heartbeat_at,cs.connected_at)
        )::text
        ELSE NULL
      END AS effective_end_at
      FROM app.call_sessions cs
      CROSS JOIN reconnect
      WHERE cs.id=$1
    `, [input.callId, role, safetyCutoffAt]);

    return {
      kind: 'connected' as const,
      role,
      status: row.status,
      safetyEventId,
      effectiveEndAt: disconnect.rows[0]?.effective_end_at ?? null,
    };
  });
}

export async function endInternetVoiceCall(
  req: IncomingMessage,
  res: ServerResponse,
  rawCallId: string,
  options?: { safety?: boolean },
) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);
  const safety = Boolean(options?.safety);
  const body = await readJson<{
    reason?: unknown;
    details?: unknown;
    blockCounterparty?: unknown;
  }>(req);
  const details = safety ? detailsFrom(body.details) : null;
  const blockCounterparty = safety && body.blockCounterparty === true;
  const endedReason = endedReasonFrom(
    body.reason,
    safety ? 'internet_voice_safety_exit' : 'internet_voice_user_ended',
  );

  const prepared = await prepareVoiceEnd({
    callId: rawCallId,
    userId,
    safety,
    details,
    blockCounterparty,
    endedReason,
  });

  if (prepared.kind === 'terminal') {
    sendJson(res, 200, {
      ok: true,
      callId: rawCallId,
      transport: 'internet_voice',
      status: prepared.status,
      idempotent: true,
    });
    return;
  }

  if (prepared.kind === 'preconnected_finalized') {
    // A listener 'answer' signal (status='calling_listener') can already have
    // kicked off provider recording before a Safety Exit/cancel lands here,
    // pre-'connected'. Stop is idempotent/no-op when nothing was ever
    // started.
    await stopRecordingForCall(rawCallId).catch(() => undefined);
    sendJson(res, 200, {
      ok: true,
      callId: rawCallId,
      transport: 'internet_voice',
      status: prepared.status,
      billableSeconds: 0,
      callerChargeMinor: '0',
      listenerEarningMinor: '0',
      holdReleased: true,
      safetyEventId: prepared.safetyEventId,
      reportPrefill: safety ? { callId: rawCallId, category: 'inappropriate_conduct' } : null,
      idempotent: false,
    });
    return;
  }

  let settlement;
  try {
    settlement = await settleInternetVoiceCall({
      callId: rawCallId,
      endedByRole: prepared.role,
      safety,
      endedReason,
      effectiveEndAt: prepared.effectiveEndAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'call_not_settleable') {
      throw new HttpError(409, 'call_end_conflict');
    }
    throw error;
  }

  sendJson(res, 200, {
    ok: true,
    callId: settlement.callId,
    transport: 'internet_voice',
    status: settlement.status,
    billableSeconds: settlement.billableSeconds,
    callerChargeMinor: settlement.callerChargeMinor,
    listenerEarningMinor: settlement.listenerEarningMinor,
    safetyEventId: prepared.safetyEventId,
    reportPrefill: safety ? { callId: rawCallId, category: 'inappropriate_conduct' } : null,
    idempotent: settlement.idempotent,
  });
}