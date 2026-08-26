import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '@yeki-hast/db';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';

export async function setAgeGate(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{ confirmed?: unknown }>(req);
  if (body.confirmed !== true) throw new HttpError(400, 'age_gate_not_confirmed');

  const minimumAge = Number(process.env.CALLER_MINIMUM_AGE);
  const policyVersion = process.env.CALLER_AGE_POLICY_VERSION?.trim();
  if (!Number.isInteger(minimumAge) || minimumAge < 13 || minimumAge > 99 || !policyVersion) {
    throw new HttpError(503, 'caller_age_policy_not_configured');
  }

  await query(`
    INSERT INTO app.caller_age_assertions(user_id, minimum_age, policy_version)
    VALUES ($1,$2,$3)
    ON CONFLICT (user_id) DO UPDATE SET minimum_age=EXCLUDED.minimum_age,
      policy_version=EXCLUDED.policy_version, assertion_method='self_attestation', asserted_at=now(), revoked_at=NULL
  `, [userId, minimumAge, policyVersion]);
  sendJson(res, 200, { ok: true, minimumAge, policyVersion });
}

export async function joinWaitlist(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{ source?: unknown; gender?: unknown; preferredLanguageCode?: unknown }>(req);
  const gender = body.gender === 'female' || body.gender === 'male' ? body.gender : null;
  const languageCode = typeof body.preferredLanguageCode === 'string' ? body.preferredLanguageCode.trim() : null;

  const entryId = await withTransaction(async (client) => {
    const product = await client.query<{ id: string }>("SELECT id::text FROM app.products WHERE code='yeki_hast'");
    const productId = product.rows[0]?.id;
    if (!productId) throw new HttpError(503, 'product_unavailable');
    let languageId: string | null = null;
    if (languageCode) {
      const lang = await client.query<{ id: string }>('SELECT id::text FROM app.languages WHERE code=$1 AND is_active=true', [languageCode]);
      if (!lang.rows[0]) throw new HttpError(400, 'unknown_language');
      languageId = lang.rows[0].id;
    }
    await client.query("INSERT INTO app.user_roles(user_id, role) VALUES ($1,'caller') ON CONFLICT DO NOTHING", [userId]);
    await client.query(`
      INSERT INTO app.caller_profiles(user_id, declared_gender, preferred_language_id)
      VALUES ($1,$2,$3)
      ON CONFLICT (user_id) DO UPDATE SET declared_gender=COALESCE(EXCLUDED.declared_gender, app.caller_profiles.declared_gender),
        preferred_language_id=COALESCE(EXCLUDED.preferred_language_id, app.caller_profiles.preferred_language_id)
    `, [userId, gender, languageId]);
    const result = await client.query<{ id: string }>(`
      INSERT INTO app.waitlist_entries(user_id, product_id, source)
      VALUES ($1,$2,$3)
      ON CONFLICT (user_id, product_id) DO UPDATE SET source=COALESCE(EXCLUDED.source, app.waitlist_entries.source), updated_at=now()
      RETURNING id::text
    `, [userId, productId, typeof body.source === 'string' ? body.source.trim().slice(0, 100) : null]);
    return result.rows[0].id;
  });
  sendJson(res, 200, { ok: true, waitlistEntryId: entryId });
}

export async function requireCurrentCallerAgeAssertion(userId: string): Promise<void> {
  const minimumAge = Number(process.env.CALLER_MINIMUM_AGE);
  const policyVersion = process.env.CALLER_AGE_POLICY_VERSION?.trim();
  if (!Number.isInteger(minimumAge) || minimumAge < 13 || minimumAge > 99 || !policyVersion) {
    throw new HttpError(503, 'caller_age_policy_not_configured');
  }
  const result = await query(`
    SELECT 1
    FROM app.caller_age_assertions
    WHERE user_id=$1
      AND minimum_age=$2
      AND policy_version=$3
      AND revoked_at IS NULL
  `, [userId, minimumAge, policyVersion]);
  if (!result.rowCount) throw new HttpError(403, 'caller_age_gate_required');
}
