import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import { encryptPrivateText } from '../lib/security.ts';
import { getTelephonyProvider } from '../providers/telephony.ts';
import { settleCallByProvider } from '../services/call-lifecycle.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reportCategories = new Set([
  'sexual_behavior',
  'harassment',
  'insult',
  'threat',
  'off_platform_request',
  'privacy_violation',
  'scam',
  'unsafe_advice',
  'inappropriate_conduct',
  'technical_problem',
  'other',
]);
const preConnectedStatuses = new Set(['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener']);
const liveStatuses = new Set([...preConnectedStatuses, 'connected']);

function callIdFrom(value: unknown): string {
  const callId = String(value ?? '').trim();
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');
  return callId;
}

function detailsFrom(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_details');
  const details = value.trim();
  if (!details) return null;
  if (details.length > 4_000) throw new HttpError(400, 'details_too_long');
  return details;
}

async function participantContext(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  callId: string,
  userId: string,
) {
  const call = await client.query<{
    caller_user_id: string;
    listener_user_id: string | null;
    status: string;
    currency_code: string;
    authorized_minor: string;
    provider_bridge_id: string | null;
    connected_at: string | null;
    ended_at: string | null;
  }>(`
    SELECT caller_user_id::text, listener_user_id::text, status::text,
           currency_code, authorized_minor::text, provider_bridge_id,
           connected_at::text, ended_at::text
    FROM app.call_sessions
    WHERE id=$1
    FOR UPDATE
  `, [callId]);
  const row = call.rows[0];
  if (!row) throw new HttpError(404, 'call_not_found');
  const isCaller = row.caller_user_id === userId;
  const isListener = row.listener_user_id === userId;
  if (!isCaller && !isListener) throw new HttpError(403, 'not_call_participant');
  const otherUserId = isCaller ? row.listener_user_id : row.caller_user_id;
  if (!otherUserId) throw new HttpError(409, 'call_counterparty_missing');
  return {
    ...row,
    role: isCaller ? 'caller' as const : 'listener' as const,
    otherUserId,
  };
}

async function upsertBlock(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  blockerUserId: string,
  blockedUserId: string,
  reasonCode: string,
) {
  await client.query(`
    INSERT INTO app.blocks(blocker_user_id, blocked_user_id, reason_code)
    VALUES ($1,$2,$3)
    ON CONFLICT (blocker_user_id, blocked_user_id) DO UPDATE SET
      reason_code=EXCLUDED.reason_code, expires_at=NULL
  `, [blockerUserId, blockedUserId, reasonCode]);
}

export async function reportCall(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{
    callId?: unknown;
    category?: unknown;
    details?: unknown;
    blockCounterparty?: unknown;
  }>(req);
  const callId = callIdFrom(body.callId);
  const category = String(body.category ?? '');
  if (!reportCategories.has(category)) throw new HttpError(400, 'invalid_report_category');
  const details = detailsFrom(body.details);
  const blockCounterparty = body.blockCounterparty === true;

  const reportId = await withTransaction(async (client) => {
    const call = await participantContext(client, callId, userId);
    const report = await client.query<{ id: string }>(`
      INSERT INTO app.reports(call_session_id, reporter_user_id, reported_user_id, category)
      VALUES ($1,$2,$3,$4)
      RETURNING id::text
    `, [callId, userId, call.otherUserId, category]);
    const id = report.rows[0].id;
    if (details) {
      await client.query(`
        INSERT INTO private_data.report_details(report_id, details_ciphertext)
        VALUES ($1,$2)
      `, [id, encryptPrivateText(details, `report_details:${id}`)]);
    }
    if (blockCounterparty) await upsertBlock(client, userId, call.otherUserId, `report:${category}`);
    return id;
  });

  sendJson(res, 201, { ok: true, reportId, blocked: blockCounterparty });
}

export async function blockCallCounterparty(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{ callId?: unknown; reasonCode?: unknown }>(req);
  const callId = callIdFrom(body.callId);
  const reasonCode = typeof body.reasonCode === 'string' && body.reasonCode.trim()
    ? body.reasonCode.trim().slice(0, 80)
    : 'user_blocked';

  await withTransaction(async (client) => {
    const call = await participantContext(client, callId, userId);
    await upsertBlock(client, userId, call.otherUserId, reasonCode);
  });

  sendJson(res, 200, { ok: true, blocked: true });
}

export async function safetyExitCall(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  const { userId } = await requireAuth(req);
  const callId = callIdFrom(rawCallId);
  const body = await readJson<{ details?: unknown; blockCounterparty?: unknown }>(req);
  const details = detailsFrom(body.details);
  const blockCounterparty = body.blockCounterparty === true;
  const stoppedAt = new Date();

  const result = await withTransaction(async (client) => {
    const call = await participantContext(client, callId, userId);
    if (call.status === 'safety_terminated') {
      if (blockCounterparty) {
        await upsertBlock(client, userId, call.otherUserId, 'safety_exit');
      }
      return {
        status: 'safety_terminated' as const,
        role: call.role,
        idempotent: true,
        safetyEventId: null,
        providerBridgeId: call.provider_bridge_id,
        connectedAt: call.connected_at,
        stoppedAt: call.ended_at ? new Date(call.ended_at) : stoppedAt,
      };
    }
    if (!liveStatuses.has(call.status)) throw new HttpError(409, 'call_not_live');
    if (call.status === 'calling_caller' && !call.provider_bridge_id) {
      throw new HttpError(409, 'telephony_dispatch_uncertain');
    }
    if (
      (call.status === 'caller_answered' || call.status === 'calling_listener' || call.status === 'connected')
      && !call.provider_bridge_id
    ) {
      throw new HttpError(409, 'call_telephony_invariant');
    }

    const event = await client.query<{ id: string }>(`
      INSERT INTO app.safety_events(call_session_id, triggered_by, trigger_user_id, severity, action_code)
      VALUES ($1,$2,$3,'high','end_for_safety')
      RETURNING id::text
    `, [callId, call.role, userId]);
    const safetyEventId = event.rows[0].id;
    if (details) {
      await client.query(`
        INSERT INTO private_data.safety_event_details(safety_event_id, details_ciphertext)
        VALUES ($1,$2)
      `, [safetyEventId, encryptPrivateText(details, `safety_event_details:${safetyEventId}`)]);
    }
    if (blockCounterparty) await upsertBlock(client, userId, call.otherUserId, 'safety_exit');

    if (preConnectedStatuses.has(call.status)) {
      const authorized = BigInt(call.authorized_minor);
      if (authorized > 0n) {
        const released = await client.query(`
          UPDATE app.wallets
          SET reserved_minor=reserved_minor-$3::bigint, version=version+1, updated_at=now()
          WHERE user_id=$1 AND currency_code=$2 AND reserved_minor >= $3::bigint
          RETURNING id
        `, [call.caller_user_id, call.currency_code, authorized.toString()]);
        if (!released.rowCount) throw new HttpError(409, 'wallet_release_conflict');
      }
    }

    await client.query(`
      UPDATE app.call_sessions
      SET status='safety_terminated', ended_at=COALESCE(ended_at,$2), ended_reason=$3, updated_at=now()
      WHERE id=$1
    `, [callId, stoppedAt.toISOString(), `safety_exit_${call.role}`]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'safety_terminated',$2,jsonb_build_object('safetyEventId',$3,'occurredAt',$4::text))
    `, [callId, call.role, safetyEventId, stoppedAt.toISOString()]);

    return {
      status: 'safety_terminated' as const,
      role: call.role,
      idempotent: false,
      safetyEventId,
      providerBridgeId: call.provider_bridge_id,
      connectedAt: call.connected_at,
      stoppedAt,
    };
  });

  let terminationPending = false;
  if (result.providerBridgeId) {
    try {
      await getTelephonyProvider().terminateCall(result.providerBridgeId, `safety_exit_${result.role}`);
    } catch {
      terminationPending = true;
      console.error('safety_telephony_termination_pending', { callId });
    }
  }

  let settlement: Awaited<ReturnType<typeof settleCallByProvider>> | null = null;
  if (result.connectedAt) {
    if (!result.providerBridgeId) throw new HttpError(409, 'call_telephony_invariant');
    const connectedAtMs = new Date(result.connectedAt).getTime();
    const connectedSeconds = Math.max(0, Math.floor((result.stoppedAt.getTime() - connectedAtMs) / 1000));
    try {
      settlement = await settleCallByProvider({
        callId,
        providerBridgeId: result.providerBridgeId,
        connectedSeconds,
        endedReason: `safety_exit_${result.role}`,
      });
    } catch (error) {
      console.error('safety_settlement_pending', { callId, error: error instanceof Error ? error.message : 'unknown' });
      throw new HttpError(503, 'safety_settlement_pending');
    }
  }

  if (terminationPending) throw new HttpError(502, 'telephony_termination_pending');

  const { providerBridgeId: _privateBridgeId, connectedAt: _connectedAt, stoppedAt: _stoppedAt, ...publicResult } = result;
  sendJson(res, 200, {
    ok: true,
    callId,
    blocked: blockCounterparty,
    ...publicResult,
    settlement: settlement ? {
      billableSeconds: settlement.billableSeconds,
      callerChargeMinor: settlement.callerChargeMinor,
      listenerEarningMinor: settlement.listenerEarningMinor,
      idempotent: settlement.idempotent,
    } : null,
  });
}
