import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { requireCallerClosedBetaEnabled } from '../lib/caller-beta.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import { encryptPrivateText, normalizeE164, phoneHash } from '../lib/security.ts';

function phoneInput(value: unknown): string {
  const raw = requireString(value, 'phone', 8, 20);
  try { return normalizeE164(raw); }
  catch { throw new HttpError(400, 'invalid_phone'); }
}

export async function getCallPhoneStatus(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const result = await query<{ configured: boolean; verified: boolean }>(`
    SELECT true AS configured, (phone_verified_at IS NOT NULL) AS verified
    FROM private_data.user_contacts
    WHERE user_id=$1
  `, [userId]);
  const row = result.rows[0];
  sendJson(res, 200, {
    configured: Boolean(row?.configured),
    verified: Boolean(row?.verified),
  });
}

export async function setCallPhone(req: IncomingMessage, res: ServerResponse) {
  // Call-phone data is only needed for Caller operation. Do not collect it while
  // the Caller beta/commercial gate is closed.
  requireCallerClosedBetaEnabled();

  const { userId } = await requireAuth(req);
  const body = await readJson<{ phone?: unknown }>(req);
  const phone = phoneInput(body.phone);
  const hash = phoneHash(phone);
  const ciphertext = encryptPrivateText(phone, `user_contacts:phone:${userId}`);

  try {
    const status = await withTransaction(async (client) => {
      const result = await client.query<{ verified: boolean }>(`
        INSERT INTO private_data.user_contacts(
          user_id, phone_e164_ciphertext, phone_hash, phone_verified_at, phone_owner_verified_at
        )
        VALUES ($1,$2,$3,NULL,NULL)
        ON CONFLICT (user_id) DO UPDATE SET
          phone_e164_ciphertext=EXCLUDED.phone_e164_ciphertext,
          phone_hash=EXCLUDED.phone_hash,
          phone_verified_at=CASE
            WHEN private_data.user_contacts.phone_hash=EXCLUDED.phone_hash
              THEN private_data.user_contacts.phone_verified_at
            ELSE NULL
          END,
          phone_owner_verified_at=CASE
            WHEN private_data.user_contacts.phone_hash=EXCLUDED.phone_hash
              THEN private_data.user_contacts.phone_owner_verified_at
            ELSE NULL
          END,
          updated_at=now()
        RETURNING (phone_verified_at IS NOT NULL) AS verified
      `, [userId, ciphertext, hash]);
      await client.query(`
        INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1,'call_phone_submitted','user',$1,
                jsonb_build_object('verified', $2::boolean))
      `, [userId, Boolean(result.rows[0]?.verified)]);
      return Boolean(result.rows[0]?.verified);
    });
    sendJson(res, 200, { ok: true, configured: true, verified: status });
  } catch (error) {
    const sqlError = error as { code?: string };
    if (sqlError?.code === '23505') throw new HttpError(409, 'phone_already_registered');
    throw error;
  }
}
