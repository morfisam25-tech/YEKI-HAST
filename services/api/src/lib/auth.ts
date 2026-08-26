import type { IncomingMessage } from 'node:http';
import { query } from '@yeki-hast/db';
import { HttpError } from './http.ts';
import { tokenHash } from './security.ts';
export interface AuthenticatedUser { userId: string }
export async function requireAuth(req: IncomingMessage): Promise<AuthenticatedUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
  const raw = header.slice(7).trim();
  if (!raw) throw new HttpError(401, 'unauthorized');
  const result = await query<{ user_id: string }>(`
    UPDATE private_data.auth_sessions s SET last_seen_at=now()
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()
      AND EXISTS (SELECT 1 FROM app.users u WHERE u.id=s.user_id AND u.status='active')
    RETURNING s.user_id::text
  `, [tokenHash(raw)]);
  const userId = result.rows[0]?.user_id;
  if (!userId) throw new HttpError(401, 'unauthorized');
  return { userId };
}
export async function revokeAllSessions(userId: string): Promise<void> {
  await query(`UPDATE private_data.auth_sessions SET revoked_at=COALESCE(revoked_at, now()) WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
}
