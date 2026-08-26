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
