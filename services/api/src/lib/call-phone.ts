import type { IncomingMessage } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from './auth.ts';
import { HttpError } from './http.ts';

export async function requireVerifiedCallPhone(req: IncomingMessage): Promise<{ userId: string }> {
  const { userId } = await requireAuth(req);
  const result = await query(`
    SELECT 1
    FROM private_data.user_contacts
    WHERE user_id=$1 AND phone_verified_at IS NOT NULL
  `, [userId]);
  if (!result.rowCount) throw new HttpError(403, 'verified_phone_required');
  return { userId };
}
