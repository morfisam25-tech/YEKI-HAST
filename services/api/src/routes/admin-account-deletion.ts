import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { sendJson } from '../lib/http.ts';

export async function listAdminAccountDeletionRequests(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);

  const result = await query<{
    user_id: string;
    processing_state: string;
  }>(`
    SELECT entity_id::text AS user_id,
           metadata->>'processingState' AS processing_state
    FROM app.audit_logs
    WHERE action='account_deletion_requested'
      AND entity_type='user'
      AND entity_id IS NOT NULL
      AND metadata->>'processingState'='pending'
    ORDER BY entity_id::text
    LIMIT 500
  `);

  sendJson(res, 200, {
    ok: true,
    requests: result.rows.map((row) => ({
      userId: row.user_id,
      processingState: row.processing_state,
    })),
    piiIncluded: false,
  });
}
