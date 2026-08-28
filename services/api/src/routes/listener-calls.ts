import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];
const TERMINAL_CALL_STATUSES = ['completed', 'missed', 'cancelled', 'failed', 'safety_terminated'];
const TERMINATION_EVENT_REASONS = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

function recentLimit(url: URL): number {
  const raw = url.searchParams.get('limit') ?? '10';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new HttpError(400, 'invalid_limit');
  return value;
}

export async function getListenerActiveCall(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await query<{
    id: string;
    status: string;
    currency_code: string;
    max_billable_seconds: number | null;
    requested_at: string;
    connected_at: string | null;
    ended_at: string | null;
    billable_seconds: number;
    listener_earning_minor: string;
    provider_bridge_id: string | null;
    termination_in_progress: boolean;
  }>(`
    SELECT cs.id::text,
           cs.status::text,
           cs.currency_code,
           cs.max_billable_seconds,
           cs.requested_at::text,
           cs.connected_at::text,
           cs.ended_at::text,
           cs.billable_seconds,
           cs.listener_earning_minor::text,
           cs.provider_bridge_id,
           EXISTS (
             SELECT 1
             FROM app.call_events ce
             WHERE ce.call_session_id=cs.id
               AND ce.metadata->>'reason' = ANY($3::text[])
           ) AS termination_in_progress
    FROM app.call_sessions cs
    WHERE cs.listener_user_id=$1
      AND cs.status::text = ANY($2::text[])
    ORDER BY cs.requested_at DESC
    LIMIT 2
  `, [userId, ACTIVE_CALL_STATUSES, TERMINATION_EVENT_REASONS]);

  if (result.rows.length > 1) throw new HttpError(409, 'listener_active_call_conflict');
  const row = result.rows[0];
  if (!row) {
    sendJson(res, 200, { activeCall: null });
    return;
  }

  sendJson(res, 200, {
    activeCall: {
      callId: row.id,
      status: row.status,
      currencyCode: row.currency_code,
      maxBillableSeconds: row.max_billable_seconds,
      telephonyReady: Boolean(row.provider_bridge_id),
      terminationInProgress: row.termination_in_progress,
      requestedAt: row.requested_at,
      connectedAt: row.connected_at,
      endedAt: row.ended_at,
      billableSeconds: row.billable_seconds,
      listenerEarningMinor: row.listener_earning_minor,
    },
    providerBridgeIncluded: false,
    callerIdentityIncluded: false,
  });
}

export async function getListenerRecentCalls(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = recentLimit(url);

  const result = await query<{
    id: string;
    status: 'completed' | 'missed' | 'cancelled' | 'failed' | 'safety_terminated';
    currency_code: string;
    requested_at: string;
    connected_at: string | null;
    ended_at: string | null;
    billable_seconds: number;
    listener_earning_minor: string;
    counterparty_action_available: boolean;
  }>(`
    SELECT id::text,
           status::text,
           currency_code,
           requested_at::text,
           connected_at::text,
           ended_at::text,
           billable_seconds,
           listener_earning_minor::text,
           (caller_user_id IS DISTINCT FROM listener_user_id) AS counterparty_action_available
    FROM app.call_sessions
    WHERE listener_user_id=$1
      AND status::text = ANY($2::text[])
    ORDER BY COALESCE(ended_at, requested_at) DESC, requested_at DESC
    LIMIT $3
  `, [userId, TERMINAL_CALL_STATUSES, limit]);

  sendJson(res, 200, {
    calls: result.rows.map((row) => ({
      callId: row.id,
      status: row.status,
      currencyCode: row.currency_code,
      requestedAt: row.requested_at,
      connectedAt: row.connected_at,
      endedAt: row.ended_at,
      billableSeconds: row.billable_seconds,
      listenerEarningMinor: row.listener_earning_minor,
      counterpartyActionAvailable: row.counterparty_action_available,
    })),
    providerBridgeIncluded: false,
    callerIdentityIncluded: false,
  });
}
