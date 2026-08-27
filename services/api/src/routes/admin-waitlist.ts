import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, sendJson } from '../lib/http.ts';

function readLimit(url: URL): number {
  const raw = url.searchParams.get('limit') ?? '100';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 200) throw new HttpError(400, 'invalid_limit');
  return value;
}

export async function listAdminCallerWaitlist(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = readLimit(url);

  const result = await query<{
    id: string;
    user_id: string;
    source: string | null;
    declared_gender: string | null;
    preferred_language_code: string | null;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT w.id::text, w.user_id::text, w.source,
           cp.declared_gender::text,
           l.code preferred_language_code,
           w.created_at::text, w.updated_at::text
    FROM app.waitlist_entries w
    JOIN app.products p ON p.id=w.product_id AND p.code='yeki_hast'
    LEFT JOIN app.caller_profiles cp ON cp.user_id=w.user_id
    LEFT JOIN app.languages l ON l.id=cp.preferred_language_id
    ORDER BY w.created_at ASC, w.id
    LIMIT $1
  `, [limit]);

  sendJson(res, 200, {
    ok: true,
    limit,
    entries: result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      source: row.source,
      gender: row.declared_gender,
      preferredLanguageCode: row.preferred_language_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      phoneNumberIncluded: false,
      ageAssertionDetailsIncluded: false,
    })),
  });
}
