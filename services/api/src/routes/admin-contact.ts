import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import { decryptPrivateText } from '../lib/security.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function manualBetaEnabled(): boolean {
  return process.env.MANUAL_PHONE_VERIFICATION_BETA_ENABLED?.trim().toLowerCase() === 'true';
}

function parseLimit(req: IncomingMessage): number {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const raw = Number(url.searchParams.get('limit') ?? '50');
  if (!Number.isInteger(raw) || raw < 1 || raw > 100) throw new HttpError(400, 'invalid_limit');
  return raw;
}

export async function listPendingCallPhones(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  if (!manualBetaEnabled()) throw new HttpError(503, 'manual_phone_verification_disabled');
  const limit = parseLimit(req);
  const result = await query<{
    user_id: string;
    phone_e164_ciphertext: string;
    email_ciphertext: string | null;
    updated_at: string;
  }>(`
    SELECT uc.user_id::text,
           uc.phone_e164_ciphertext,
           ue.email_ciphertext,
           uc.updated_at::text
    FROM private_data.user_contacts uc
    LEFT JOIN private_data.user_emails ue ON ue.user_id=uc.user_id
    WHERE uc.phone_verified_at IS NULL
    ORDER BY uc.updated_at ASC
    LIMIT $1
  `, [limit]);

  sendJson(res, 200, {
    manualBetaEnabled: true,
    users: result.rows.map((row) => ({
      userId: row.user_id,
      phone: decryptPrivateText(row.phone_e164_ciphertext, `user_contacts:phone:${row.user_id}`),
      email: row.email_ciphertext
        ? decryptPrivateText(row.email_ciphertext, `user_emails:email:${row.user_id}`)
        : null,
      submittedAt: row.updated_at,
    })),
  });
}

export async function verifyCallPhoneManually(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
) {
  const admin = await requireAdmin(req);
  if (!manualBetaEnabled()) throw new HttpError(503, 'manual_phone_verification_disabled');
  if (!UUID_RE.test(userId)) throw new HttpError(400, 'invalid_user');
  const body = await readJson<{ confirmed?: unknown; note?: unknown }>(req);
  if (body.confirmed !== true) throw new HttpError(400, 'verification_confirmation_required');
  const note = typeof body.note === 'string' && body.note.trim()
    ? body.note.trim().slice(0, 200)
    : null;

  const updated = await withTransaction(async (client) => {
    const contact = await client.query(`
      UPDATE private_data.user_contacts
      SET phone_verified_at=COALESCE(phone_verified_at, now()),
          phone_owner_verified_at=COALESCE(phone_owner_verified_at, now()),
          updated_at=now()
      WHERE user_id=$1
      RETURNING user_id
    `, [userId]);
    if (!contact.rowCount) throw new HttpError(404, 'call_phone_not_configured');

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'manual_beta_phone_verified','user',$2,
              jsonb_build_object('method','admin_out_of_band','note',$3::text))
    `, [admin.userId, userId, note]);
    return true;
  });

  sendJson(res, 200, { ok: updated, userId, verified: true });
}
