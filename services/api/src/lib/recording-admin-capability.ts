import { query, withTransaction } from '../../../../packages/db/src/client.ts';

// W81A — controlled provisioning for app.admin_capabilities (see
// packages/db/migrations/0010_recording_core_foundation.sql and this repo's
// lib/admin.ts requireAdminCapability()). admin_role is a single free-text
// field with no permission hierarchy except the one-time bootstrap 'owner'
// row created in routes/auth.ts / routes/auth-email.ts maybeBootstrapFirstAdmin
// -- that is the only "super-admin equivalent" this codebase's authorization
// model already recognizes, so granting/revoking a capability is gated on the
// acting admin holding that same 'owner' role rather than inventing a new
// privilege tier. This module has no HTTP route: it is meant to be driven by
// scripts/manage-recording-admin-capability.ts, an operator/release-time CLI
// with direct DATABASE_URL access -- the same trust boundary every other
// scripts/*.mjs release tool already operates at, and deliberately not a
// public (or even admin-session-authenticated) API surface.

export const RECORDING_ADMIN_CAPABILITY = 'recording_admin';

export class AdminCapabilityError extends Error {
  public code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

interface AdminIdentity {
  userId: string;
  adminRole: string;
  isActive: boolean;
}

async function loadActiveAdmin(userId: string): Promise<AdminIdentity | null> {
  const result = await query<{ user_id: string; admin_role: string; is_active: boolean }>(`
    SELECT user_id::text, admin_role, is_active
    FROM app.admin_users
    WHERE user_id=$1
  `, [userId]);
  const row = result.rows[0];
  if (!row) return null;
  return { userId: row.user_id, adminRole: row.admin_role, isActive: row.is_active };
}

// Fail closed: throws (never returns a "maybe") unless the actor is a
// currently-active admin holding the bootstrap-equivalent 'owner' role. A
// deactivated or non-'owner' admin_users row is rejected the same way a
// missing one is.
async function requireOwnerActor(actorUserId: string, actionCode: string): Promise<AdminIdentity> {
  const actor = await loadActiveAdmin(actorUserId);
  if (!actor || !actor.isActive) throw new AdminCapabilityError('admin_capability_actor_not_active_admin');
  if (actor.adminRole !== 'owner') throw new AdminCapabilityError('admin_capability_actor_must_be_owner');
  void actionCode;
  return actor;
}

export interface CapabilityGrantResult {
  status: 'granted' | 'already_granted';
  capability: string;
  targetUserId: string;
  grantedBy: string;
}

export interface CapabilityRevokeResult {
  status: 'revoked' | 'already_absent';
  capability: string;
  targetUserId: string;
  revokedBy: string;
}

export interface CapabilityAssignment {
  userId: string;
  capability: string;
  grantedBy: string | null;
  grantedAt: string;
  adminRole: string;
  isActive: boolean;
}

export async function grantAdminCapability(input: {
  capability: string;
  targetAdminUserId: string;
  actingAdminUserId: string;
  allowSelfGrant?: boolean;
}): Promise<CapabilityGrantResult> {
  const actor = await requireOwnerActor(input.actingAdminUserId, 'admin_capability_grant');

  // Cannot self-escalate unless explicitly allowed: an owner granting a
  // capability to themselves is refused by default, the same way the
  // bootstrap flow only ever assigns 'owner' once and never lets a caller
  // self-assign admin_role. --allow-self on the CLI is the explicit override.
  if (input.targetAdminUserId === actor.userId && !input.allowSelfGrant) {
    throw new AdminCapabilityError('admin_capability_self_grant_not_allowed');
  }

  const target = await loadActiveAdmin(input.targetAdminUserId);
  if (!target) throw new AdminCapabilityError('admin_capability_target_not_admin');
  if (!target.isActive) throw new AdminCapabilityError('admin_capability_target_not_active');

  return withTransaction(async (client) => {
    const inserted = await client.query(`
      INSERT INTO app.admin_capabilities(user_id, capability, granted_by)
      VALUES ($1,$2,$3)
      ON CONFLICT (user_id, capability) DO NOTHING
      RETURNING 1
    `, [target.userId, input.capability, actor.userId]);
    const status: CapabilityGrantResult['status'] = inserted.rowCount ? 'granted' : 'already_granted';

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'admin_capability_grant','admin_capability',$2,jsonb_build_object(
        'capability',$3::text,'targetUserId',$2::text,'alreadyGranted',$4::boolean
      ))
    `, [actor.userId, target.userId, input.capability, status === 'already_granted']);

    return { status, capability: input.capability, targetUserId: target.userId, grantedBy: actor.userId };
  });
}

export async function revokeAdminCapability(input: {
  capability: string;
  targetAdminUserId: string;
  actingAdminUserId: string;
}): Promise<CapabilityRevokeResult> {
  const actor = await requireOwnerActor(input.actingAdminUserId, 'admin_capability_revoke');

  return withTransaction(async (client) => {
    const deleted = await client.query(`
      DELETE FROM app.admin_capabilities
      WHERE user_id=$1 AND capability=$2
      RETURNING 1
    `, [input.targetAdminUserId, input.capability]);
    const status: CapabilityRevokeResult['status'] = deleted.rowCount ? 'revoked' : 'already_absent';

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'admin_capability_revoke','admin_capability',$2,jsonb_build_object(
        'capability',$3::text,'targetUserId',$2::text,'alreadyAbsent',$4::boolean
      ))
    `, [actor.userId, input.targetAdminUserId, input.capability, status === 'already_absent']);

    return { status, capability: input.capability, targetUserId: input.targetAdminUserId, revokedBy: actor.userId };
  });
}

// Listing is read-only and does not require the 'owner' role -- it is safe
// for any caller that already reached this module (the CLI's own DB access
// is the trust boundary; see module header) to see who currently holds a
// capability, matching Mission A's "listing relevant admin capability
// assignments" requirement.
export async function listAdminCapabilityAssignments(capability: string): Promise<CapabilityAssignment[]> {
  const result = await query<{
    user_id: string;
    capability: string;
    granted_by: string | null;
    granted_at: string;
    admin_role: string;
    is_active: boolean;
  }>(`
    SELECT ac.user_id::text, ac.capability, ac.granted_by::text, ac.granted_at::text,
           au.admin_role, au.is_active
    FROM app.admin_capabilities ac
    JOIN app.admin_users au ON au.user_id = ac.user_id
    WHERE ac.capability = $1
    ORDER BY ac.granted_at DESC
  `, [capability]);
  return result.rows.map((row) => ({
    userId: row.user_id,
    capability: row.capability,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    adminRole: row.admin_role,
    isActive: row.is_active,
  }));
}
