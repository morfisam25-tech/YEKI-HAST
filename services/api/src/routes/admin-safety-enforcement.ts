import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';

// W36 / Task D — minimal, reversible admin safety enforcement.
//
// This reuses the EXISTING, canonical account state machine — `app.users.status`
// (enum 'active' | 'suspended' | 'archived', migration 0001) — rather than
// introducing a second account-state system. Suspension is fail-closed by
// construction: `requireAuth` only accepts sessions whose user is `status='active'`
// (services/api/src/lib/auth.ts), so a suspended user cannot authenticate at all —
// they cannot initiate or answer calls, cannot refresh listener presence (so they
// fall out of instant matching), and cannot take any authenticated action. In
// addition, the instant match candidate query (caller-call-request.ts) and the
// marketplace browse (marketplace.ts) exclude non-active listeners so suspension
// takes effect immediately rather than only after presence decays.
//
// Suspension never deletes data and never touches wallets, payouts, reports,
// blocks, or audit history — it only flips the account status flag. Unsuspend
// restores 'active'. Both are admin-only, reason-coded, audited, and idempotent.
//
// It deliberately never operates on 'archived' accounts (those belong to the
// account-deletion lifecycle) and refuses to suspend the acting admin or any
// active admin, so a safety operator cannot lock themselves or each other out.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

type LimitationAction = 'suspend' | 'unsuspend';

function userIdFrom(value: string): string {
  if (!UUID_RE.test(value)) throw new HttpError(400, 'invalid_user');
  return value;
}

function actionFrom(value: unknown): LimitationAction {
  if (value === 'suspend' || value === 'unsuspend') return value;
  throw new HttpError(400, 'invalid_limitation_action');
}

function reasonCodeFrom(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!REASON_RE.test(code)) throw new HttpError(400, 'invalid_reason_code');
  return code;
}

export async function setAdminUserSafetyLimitation(
  req: IncomingMessage,
  res: ServerResponse,
  rawUserId: string,
) {
  const admin = await requireAdmin(req);
  const targetUserId = userIdFrom(rawUserId);
  const body = await readJson<{ action?: unknown; reasonCode?: unknown }>(req);
  const action = actionFrom(body.action);
  const reasonCode = reasonCodeFrom(body.reasonCode);

  // Never suspend the acting admin's own account.
  if (action === 'suspend' && targetUserId === admin.userId) {
    throw new HttpError(409, 'cannot_suspend_self');
  }

  const targetStatus = action === 'suspend' ? 'suspended' : 'active';
  const requiredCurrent = action === 'suspend' ? 'active' : 'suspended';

  const result = await withTransaction(async (client) => {
    const current = await client.query<{ status: string; is_admin: boolean }>(`
      SELECT u.status::text,
             EXISTS (
               SELECT 1 FROM app.admin_users a WHERE a.user_id=u.id AND a.is_active=true
             ) AS is_admin
      FROM app.users u
      WHERE u.id=$1
      FOR UPDATE
    `, [targetUserId]);
    const existing = current.rows[0];
    if (!existing) throw new HttpError(404, 'user_not_found');

    // Do not suspend an active admin/safety operator through this tool.
    if (action === 'suspend' && existing.is_admin) throw new HttpError(409, 'cannot_suspend_admin');

    // Archived accounts belong to the deletion lifecycle; never touch them here.
    if (existing.status === 'archived') throw new HttpError(409, 'user_archived');

    // Idempotent: already in the desired state → no-op, no new audit row.
    if (existing.status === targetStatus) {
      return { status: existing.status, changed: false };
    }

    const updated = await client.query<{ status: string }>(`
      UPDATE app.users
      SET status=$2::app.user_status, updated_at=now()
      WHERE id=$1 AND status::text=$3
      RETURNING status::text
    `, [targetUserId, targetStatus, requiredCurrent]);
    if (!updated.rows[0]) throw new HttpError(409, 'user_state_conflict');

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,$2,'user',$3, jsonb_build_object('reasonCode',$4::text,'targetStatus',$5::text))
    `, [admin.userId, `admin_safety_${action}`, targetUserId, reasonCode, targetStatus]);

    return { status: updated.rows[0].status, changed: true };
  });

  sendJson(res, 200, {
    ok: true,
    action,
    changed: result.changed,
    user: { id: targetUserId, status: result.status },
  });
}
