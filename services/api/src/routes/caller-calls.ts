import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const TERMINAL_CALL_STATUSES = ['completed', 'missed', 'cancelled', 'failed', 'safety_terminated'];

function recentLimit(url: URL): number {
  const raw = url.searchParams.get('limit') ?? '10';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new HttpError(400, 'invalid_limit');
  return value;
}

export async function getCallerRecentCalls(req: IncomingMessage, res: ServerResponse) {
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
    caller_charge_minor: string;
    counterparty_action_available: boolean;
  }>(`
    SELECT id::text,
           status::text,
           currency_code,
           requested_at::text,
           connected_at::text,
           ended_at::text,
           billable_seconds,
           caller_charge_minor::text,
           (listener_user_id IS NOT NULL AND caller_user_id IS DISTINCT FROM listener_user_id) AS counterparty_action_available
    FROM app.call_sessions
    WHERE caller_user_id=$1
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
      callerChargeMinor: row.caller_charge_minor,
      counterpartyActionAvailable: row.counterparty_action_available,
    })),
    providerBridgeIncluded: false,
    listenerIdentityIncluded: false,
  });
}
