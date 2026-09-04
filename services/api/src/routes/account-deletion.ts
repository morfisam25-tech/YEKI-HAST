import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';

type PendingRequest = {
  id: string;
};

async function requireSelfServiceDeletableAccount(userId: string): Promise<void> {
  const activeAdmin = await query(`
    SELECT 1 FROM app.admin_users
    WHERE user_id=$1 AND is_active=true
    LIMIT 1
  `, [userId]);
  if (activeAdmin.rowCount) throw new HttpError(409, 'admin_account_deletion_requires_transfer');
}

async function ensurePendingDeletionRequest(userId: string): Promise<{ requestId: string; alreadyRequested: boolean }> {
  return withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:account_deletion:' || $1::text, 0))",
      [userId],
    );

    const prior = await client.query<PendingRequest>(`
      SELECT id::text
      FROM app.audit_logs
      WHERE actor_user_id=$1
        AND action='account_deletion_requested'
        AND entity_type='user'
        AND entity_id=$1::text
        AND metadata->>'processingState'='pending'
      ORDER BY id DESC
      LIMIT 1
    `, [userId]);

    let requestId = prior.rows[0]?.id;
    if (!requestId) {
      const inserted = await client.query<PendingRequest>(`
        INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1,'account_deletion_requested','user',$1,
                jsonb_build_object('source','self_service','processingState','pending'))
        RETURNING id::text
      `, [userId]);
      requestId = inserted.rows[0].id;
    }

    // Revocation is committed independently from destructive deletion. If a
    // retention-protected row blocks hard deletion, the account still loses
    // every active session and remains queued for review.
    await client.query(`
      UPDATE private_data.auth_sessions
      SET revoked_at=COALESCE(revoked_at, now())
      WHERE user_id=$1 AND revoked_at IS NULL
    `, [userId]);

    return { requestId, alreadyRequested: Boolean(prior.rowCount) };
  });
}

async function tryCompleteDeletion(userId: string, requestId: string): Promise<'completed' | 'review_required'> {
  try {
    return await withTransaction<'completed'>(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:account_deletion:' || $1::text, 0))",
        [userId],
      );

      // Defense in depth against a role change racing the preflight check.
      const activeAdmin = await client.query(`
        SELECT 1 FROM app.admin_users
        WHERE user_id=$1 AND is_active=true
        LIMIT 1
      `, [userId]);
      if (activeAdmin.rowCount) throw new HttpError(409, 'admin_account_deletion_requires_transfer');

      const identities = await client.query<{ email_hash: string | null; phone_hash: string | null }>(`
        SELECT e.email_hash::text, c.phone_hash::text
        FROM app.users u
        LEFT JOIN private_data.user_emails e ON e.user_id=u.id
        LEFT JOIN private_data.user_contacts c ON c.user_id=u.id
        WHERE u.id=$1
        FOR UPDATE OF u
      `, [userId]);
      const identity = identities.rows[0];
      if (!identity) {
        // Idempotent success: the account was already physically removed.
        return 'completed';
      }

      // OTP challenge rows are keyed by one-way identity hashes rather than a
      // user FK, so delete them explicitly before the identity rows disappear.
      if (identity.email_hash) {
        await client.query('DELETE FROM private_data.email_otp_challenges WHERE email_hash=$1', [identity.email_hash]);
      }
      if (identity.phone_hash) {
        await client.query('DELETE FROM private_data.otp_challenges WHERE phone_hash=$1', [identity.phone_hash]);
      }

      // Audit history has a NO ACTION actor FK by design. Remove the user link
      // and direct account entity identifier while preserving a minimal,
      // non-identifying completion record. Other retained operational rows
      // remain authoritative and will make the user DELETE fail closed via FK.
      await client.query(`
        UPDATE app.audit_logs
        SET actor_user_id=NULL,
            entity_id=CASE WHEN entity_type='user' AND entity_id=$1::text THEN NULL ELSE entity_id END,
            ip_hash=NULL,
            metadata=CASE
              WHEN id=$2::bigint THEN jsonb_build_object(
                'source','self_service',
                'processingState','completed',
                'identityLinkRemoved',true
              )
              ELSE jsonb_build_object('redactedAfterAccountDeletion',true)
            END
        WHERE actor_user_id=$1
           OR (entity_type='user' AND entity_id=$1::text)
      `, [userId, requestId]);

      // The schema uses ON DELETE CASCADE for account-owned identity, session,
      // listener-application, KYC, device, role and related beta rows. Ledger,
      // call, safety and other retention-sensitive relationships use NO ACTION.
      // Therefore a clean Technical Beta account is physically deleted now,
      // while a retention-sensitive account fails this transaction atomically
      // and stays pending from ensurePendingDeletionRequest().
      await client.query('DELETE FROM app.users WHERE id=$1 RETURNING id', [userId]);
      return 'completed';
    });
  } catch (error) {
    const sqlError = error as { code?: string };
    if (sqlError?.code === '23503') return 'review_required';
    throw error;
  }
}

export async function requestAccountDeletion(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await requireSelfServiceDeletableAccount(userId);
  const { requestId, alreadyRequested } = await ensurePendingDeletionRequest(userId);
  const outcome = await tryCompleteDeletion(userId, requestId);
  const deletionCompleted = outcome === 'completed';

  sendJson(res, deletionCompleted ? 200 : 202, {
    ok: true,
    status: deletionCompleted ? 'completed' : 'requested',
    alreadyRequested,
    sessionsRevoked: true,
    deletionCompleted,
    reviewRequired: !deletionCompleted,
  });
}