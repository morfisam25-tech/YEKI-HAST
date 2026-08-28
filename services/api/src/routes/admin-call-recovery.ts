import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTING_STALE_MINUTES = 5;
const TERMINATION_EVENT_REASONS = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

export async function recoverStaleRoutingCall(
  req: IncomingMessage,
  res: ServerResponse,
  rawCallId: string,
) {
  const admin = await requireAdmin(req);
  if (!UUID_RE.test(rawCallId)) throw new HttpError(400, 'invalid_call');

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      caller_user_id: string;
      status: string;
      currency_code: string;
      authorized_minor: string;
      provider_bridge_id: string | null;
      connected_at: string | null;
      ended_reason: string | null;
      is_stale: boolean;
    }>(`
      SELECT id::text,
             caller_user_id::text,
             status::text,
             currency_code,
             authorized_minor::text,
             provider_bridge_id,
             connected_at::text,
             ended_reason,
             (updated_at < now() - ($2::int * interval '1 minute')) AS is_stale
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [rawCallId, ROUTING_STALE_MINUTES]);

    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');

    if (row.status === 'failed' && row.ended_reason === 'admin_stale_routing_recovery') {
      return { status: 'failed' as const, idempotent: true };
    }

    if (row.status !== 'routing') throw new HttpError(409, 'call_recovery_not_safe');
    if (row.provider_bridge_id !== null || row.connected_at !== null) {
      throw new HttpError(409, 'call_recovery_not_safe');
    }
    if (!row.is_stale) throw new HttpError(409, 'call_not_stale');

    const termination = await client.query(`
      SELECT 1
      FROM app.call_events
      WHERE call_session_id=$1
        AND metadata->>'reason' = ANY($2::text[])
      LIMIT 1
    `, [rawCallId, TERMINATION_EVENT_REASONS]);
    if (termination.rowCount) throw new HttpError(409, 'call_termination_in_progress');

    const authorized = BigInt(row.authorized_minor);
    if (authorized > 0n) {
      const release = await client.query(`
        UPDATE app.wallets
        SET reserved_minor=reserved_minor-$3::bigint,
            version=version+1,
            updated_at=now()
        WHERE user_id=$1
          AND currency_code=$2
          AND reserved_minor >= $3::bigint
        RETURNING id
      `, [row.caller_user_id, row.currency_code, authorized.toString()]);
      if (!release.rowCount) throw new HttpError(409, 'wallet_release_conflict');
    }

    const failed = await client.query(`
      UPDATE app.call_sessions
      SET status='failed',
          ended_at=COALESCE(ended_at, now()),
          ended_reason='admin_stale_routing_recovery',
          updated_at=now()
      WHERE id=$1
        AND status='routing'
        AND provider_bridge_id IS NULL
        AND connected_at IS NULL
      RETURNING id
    `, [rawCallId]);
    if (!failed.rowCount) throw new HttpError(409, 'call_recovery_conflict');

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'failed','admin',jsonb_build_object('reason','stale_routing_recovery'))
    `, [rawCallId]);

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'admin_call_stale_routing_recovery','call_session',$2,
              jsonb_build_object('releasedAuthorizationMinor',$3,'staleMinutes',$4))
    `, [admin.userId, rawCallId, authorized.toString(), ROUTING_STALE_MINUTES]);

    return { status: 'failed' as const, idempotent: false };
  });

  sendJson(res, 200, {
    ok: true,
    callId: rawCallId,
    status: result.status,
    idempotent: result.idempotent,
    recoveryScope: 'stale_routing_only',
  });
}
