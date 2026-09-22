import type { IncomingMessage } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from './auth.ts';
import { HttpError } from './http.ts';

export type AuthenticatedAdmin = {
  userId: string;
  adminRole: string;
};

export async function requireAdmin(req: IncomingMessage): Promise<AuthenticatedAdmin> {
  const { userId } = await requireAuth(req);
  const result = await query<{ admin_role: string }>(`
    SELECT admin_role
    FROM app.admin_users
    WHERE user_id=$1 AND is_active=true
  `, [userId]);
  const adminRole = result.rows[0]?.admin_role;
  if (!adminRole) throw new HttpError(403, 'admin_required');
  return { userId, adminRole };
}

// Smallest safe capability mechanism (see app.admin_capabilities in the W58
// recording migration): admin_role today is a single free-text field with no
// fine-grained permission, so anything that must NOT be available to every
// admin by default (recording playback/hold) is gated by an explicit,
// separately-granted capability row instead of widening admin_role.
export async function requireAdminCapability(req: IncomingMessage, capability: string): Promise<AuthenticatedAdmin> {
  const admin = await requireAdmin(req);
  const result = await query(`
    SELECT 1 FROM app.admin_capabilities WHERE user_id=$1 AND capability=$2
  `, [admin.userId, capability]);
  if (!result.rowCount) throw new HttpError(403, 'admin_capability_required');
  return admin;
}
