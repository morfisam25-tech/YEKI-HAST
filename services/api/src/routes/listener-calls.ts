import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];

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
  }>(`
    SELECT id::text,
           status::text,
           currency_code,
           max_billable_seconds,
           requested_at::text,
           connected_at::text,
           ended_at::text,
           billable_seconds,
           listener_earning_minor::text,
           provider_bridge_id
    FROM app.call_sessions
    WHERE listener_user_id=$1
      AND status::text = ANY($2::text[])
    ORDER BY requested_at DESC
    LIMIT 2
  `, [userId, ACTIVE_CALL_STATUSES]);

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
