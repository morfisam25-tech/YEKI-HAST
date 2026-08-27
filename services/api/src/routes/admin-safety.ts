import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const allowedStatuses = new Set(['open', 'in_review', 'resolved', 'dismissed']);

function readLimit(url: URL): number {
  const raw = url.searchParams.get('limit') ?? '50';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new HttpError(400, 'invalid_limit');
  return value;
}

function readStatus(url: URL): string | null {
  const raw = url.searchParams.get('status');
  if (!raw) return null;
  if (!allowedStatuses.has(raw)) throw new HttpError(400, 'invalid_status');
  return raw;
}

export async function listAdminSafetyCases(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = readLimit(url);
  const status = readStatus(url);

  const reports = await query<{
    id: string;
    call_session_id: string | null;
    reporter_user_id: string;
    reported_user_id: string | null;
    category: string;
    severity: string;
    status: string;
    assigned_admin_user_id: string | null;
    resolution_code: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT id::text, call_session_id::text, reporter_user_id::text, reported_user_id::text,
           category::text, severity::text, status::text, assigned_admin_user_id::text,
           resolution_code, resolved_at::text, created_at::text, updated_at::text
    FROM app.reports
    WHERE ($1::text IS NULL OR status::text=$1)
    ORDER BY
      CASE severity::text WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT $2
  `, [status, limit]);

  const events = await query<{
    id: string;
    call_session_id: string;
    triggered_by: string;
    trigger_user_id: string | null;
    severity: string;
    status: string;
    action_code: string | null;
    assigned_admin_user_id: string | null;
    resolution_code: string | null;
    triggered_at: string;
    resolved_at: string | null;
    updated_at: string;
  }>(`
    SELECT id::text, call_session_id::text, triggered_by::text, trigger_user_id::text,
           severity::text, status::text, action_code, assigned_admin_user_id::text,
           resolution_code, triggered_at::text, resolved_at::text, updated_at::text
    FROM app.safety_events
    WHERE ($1::text IS NULL OR status::text=$1)
    ORDER BY
      CASE severity::text WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      triggered_at DESC
    LIMIT $2
  `, [status, limit]);

  sendJson(res, 200, {
    ok: true,
    filters: { status, limit },
    reports: reports.rows.map((row) => ({
      id: row.id,
      callId: row.call_session_id,
      reporterUserId: row.reporter_user_id,
      reportedUserId: row.reported_user_id,
      category: row.category,
      severity: row.severity,
      status: row.status,
      assignedAdminUserId: row.assigned_admin_user_id,
      resolutionCode: row.resolution_code,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      privateDetailsIncluded: false,
    })),
    safetyEvents: events.rows.map((row) => ({
      id: row.id,
      callId: row.call_session_id,
      triggeredBy: row.triggered_by,
      triggerUserId: row.trigger_user_id,
      severity: row.severity,
      status: row.status,
      actionCode: row.action_code,
      assignedAdminUserId: row.assigned_admin_user_id,
      resolutionCode: row.resolution_code,
      triggeredAt: row.triggered_at,
      resolvedAt: row.resolved_at,
      updatedAt: row.updated_at,
      privateDetailsIncluded: false,
    })),
  });
}
