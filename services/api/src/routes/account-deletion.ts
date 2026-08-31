import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { sendJson } from '../lib/http.ts';

export async function requestAccountDeletion(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);

  const alreadyRequested = await withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:account_deletion:' || $1::text, 0))",
      [userId],
    );

    const prior = await client.query(`
      SELECT 1
      FROM app.audit_logs
      WHERE actor_user_id=$1
        AND action='account_deletion_requested'
        AND entity_type='user'
        AND entity_id=$1
        AND metadata->>'processingState'='pending'
      LIMIT 1
    `, [userId]);

    if (!prior.rowCount) {
      await client.query(`
        INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1,'account_deletion_requested','user',$1,
                jsonb_build_object('source','self_service','processingState','pending'))
      `, [userId]);
    }

    // A deletion request is a security-sensitive account action. Revoke every
    // active session immediately; final deletion/anonymization is processed
    // separately after retention and financial-ledger constraints are checked.
    await client.query(`
      UPDATE private_data.auth_sessions
      SET revoked_at=COALESCE(revoked_at, now())
      WHERE user_id=$1 AND revoked_at IS NULL
    `, [userId]);

    return Boolean(prior.rowCount);
  });

  sendJson(res, 202, {
    ok: true,
    status: 'requested',
    alreadyRequested,
    sessionsRevoked: true,
    deletionCompleted: false,
  });
}
