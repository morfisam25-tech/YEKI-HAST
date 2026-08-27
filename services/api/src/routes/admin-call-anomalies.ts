import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { sendJson } from '../lib/http.ts';

const PRECONNECT_STALE_MINUTES = 5;
const CONNECTED_GRACE_SECONDS = 120;

export async function getAdminCallAnomalies(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);

  const missingBridge = await query<{
    id: string;
    status: string;
    requested_at: string;
    updated_at: string;
  }>(`
    SELECT id::text, status::text, requested_at::text, updated_at::text
    FROM app.call_sessions
    WHERE status::text IN ('calling_caller','caller_answered','calling_listener','connected')
      AND provider_bridge_id IS NULL
    ORDER BY requested_at ASC
    LIMIT 100
  `);

  const stalePreconnect = await query<{
    id: string;
    status: string;
    requested_at: string;
    updated_at: string;
  }>(`
    SELECT id::text, status::text, requested_at::text, updated_at::text
    FROM app.call_sessions
    WHERE status::text IN ('routing','calling_caller','caller_answered','calling_listener')
      AND updated_at < now() - ($1::int * interval '1 minute')
    ORDER BY updated_at ASC
    LIMIT 100
  `, [PRECONNECT_STALE_MINUTES]);

  const connectedOverrun = await query<{
    id: string;
    status: string;
    billing_started_at: string;
    max_billable_seconds: number;
    updated_at: string;
  }>(`
    SELECT id::text, status::text, billing_started_at::text, max_billable_seconds, updated_at::text
    FROM app.call_sessions
    WHERE status='connected'
      AND billing_started_at IS NOT NULL
      AND max_billable_seconds IS NOT NULL
      AND now() > billing_started_at
        + (max_billable_seconds * interval '1 second')
        + ($1::int * interval '1 second')
    ORDER BY billing_started_at ASC
    LIMIT 100
  `, [CONNECTED_GRACE_SECONDS]);

  const underReservedWallets = await query<{
    user_id: string;
    currency_code: string;
    reserved_minor: string;
    required_reserved_minor: string;
    active_call_count: number;
  }>(`
    WITH active_authorizations AS (
      SELECT caller_user_id,
             currency_code,
             SUM(authorized_minor)::bigint AS required_reserved_minor,
             COUNT(*)::int AS active_call_count
      FROM app.call_sessions
      WHERE status::text IN ('requested','routing','calling_caller','caller_answered','calling_listener','connected')
      GROUP BY caller_user_id, currency_code
    )
    SELECT w.user_id::text,
           w.currency_code,
           w.reserved_minor::text,
           a.required_reserved_minor::text,
           a.active_call_count
    FROM active_authorizations a
    JOIN app.wallets w
      ON w.user_id=a.caller_user_id AND w.currency_code=a.currency_code
    WHERE w.reserved_minor < a.required_reserved_minor
    ORDER BY (a.required_reserved_minor - w.reserved_minor) DESC
    LIMIT 100
  `);

  const invariantViolations = await query<{
    id: string;
    status: string;
    issue_code: string;
    authorized_minor: string;
    caller_charge_minor: string;
    listener_earning_minor: string;
    updated_at: string;
  }>(`
    SELECT cs.id::text,
           cs.status::text,
           CASE
             WHEN cs.caller_charge_minor > cs.authorized_minor THEN 'charge_exceeds_authorization'
             WHEN cs.listener_earning_minor > cs.caller_charge_minor THEN 'earning_exceeds_charge'
             WHEN cs.status::text='connected' AND cs.billing_started_at IS NULL THEN 'connected_without_billing_start'
             WHEN cs.status::text IN ('requested','routing','calling_caller','caller_answered','calling_listener','connected')
                  AND cs.ended_at IS NOT NULL THEN 'active_with_end_time'
             WHEN cs.status::text IN ('completed','cancelled','failed','safety_terminated') AND cs.ended_at IS NULL THEN 'terminal_without_end_time'
             WHEN cs.status::text IN ('completed','safety_terminated')
                  AND cs.caller_charge_minor > 0
                  AND NOT EXISTS (
                    SELECT 1 FROM app.wallet_transactions wt
                    WHERE wt.call_session_id=cs.id AND wt.type='call_charge'
                  ) THEN 'charge_without_wallet_transaction'
             WHEN cs.status::text IN ('completed','safety_terminated')
                  AND cs.listener_earning_minor > 0
                  AND NOT EXISTS (
                    SELECT 1 FROM app.listener_earnings le
                    WHERE le.call_session_id=cs.id
                  ) THEN 'earning_without_listener_earning'
             ELSE 'unknown'
           END AS issue_code,
           cs.authorized_minor::text,
           cs.caller_charge_minor::text,
           cs.listener_earning_minor::text,
           cs.updated_at::text
    FROM app.call_sessions cs
    WHERE cs.caller_charge_minor > cs.authorized_minor
       OR cs.listener_earning_minor > cs.caller_charge_minor
       OR (cs.status::text='connected' AND cs.billing_started_at IS NULL)
       OR (
         cs.status::text IN ('requested','routing','calling_caller','caller_answered','calling_listener','connected')
         AND cs.ended_at IS NOT NULL
       )
       OR (cs.status::text IN ('completed','cancelled','failed','safety_terminated') AND cs.ended_at IS NULL)
       OR (
         cs.status::text IN ('completed','safety_terminated')
         AND cs.caller_charge_minor > 0
         AND NOT EXISTS (
           SELECT 1 FROM app.wallet_transactions wt
           WHERE wt.call_session_id=cs.id AND wt.type='call_charge'
         )
       )
       OR (
         cs.status::text IN ('completed','safety_terminated')
         AND cs.listener_earning_minor > 0
         AND NOT EXISTS (
           SELECT 1 FROM app.listener_earnings le
           WHERE le.call_session_id=cs.id
         )
       )
    ORDER BY cs.updated_at ASC
    LIMIT 100
  `);

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    thresholds: {
      preconnectStaleMinutes: PRECONNECT_STALE_MINUTES,
      connectedGraceSeconds: CONNECTED_GRACE_SECONDS,
    },
    counts: {
      missingBridge: missingBridge.rowCount ?? missingBridge.rows.length,
      stalePreconnect: stalePreconnect.rowCount ?? stalePreconnect.rows.length,
      connectedOverrun: connectedOverrun.rowCount ?? connectedOverrun.rows.length,
      underReservedWallets: underReservedWallets.rowCount ?? underReservedWallets.rows.length,
      invariantViolations: invariantViolations.rowCount ?? invariantViolations.rows.length,
    },
    anomalies: {
      missingBridge: missingBridge.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        requestedAt: row.requested_at,
        updatedAt: row.updated_at,
      })),
      stalePreconnect: stalePreconnect.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        requestedAt: row.requested_at,
        updatedAt: row.updated_at,
      })),
      connectedOverrun: connectedOverrun.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        billingStartedAt: row.billing_started_at,
        maxBillableSeconds: row.max_billable_seconds,
        updatedAt: row.updated_at,
      })),
      underReservedWallets: underReservedWallets.rows.map((row) => ({
        userId: row.user_id,
        currencyCode: row.currency_code,
        reservedMinor: row.reserved_minor,
        requiredReservedMinor: row.required_reserved_minor,
        activeCallCount: row.active_call_count,
      })),
      invariantViolations: invariantViolations.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        issueCode: row.issue_code,
        authorizedMinor: row.authorized_minor,
        callerChargeMinor: row.caller_charge_minor,
        listenerEarningMinor: row.listener_earning_minor,
        updatedAt: row.updated_at,
      })),
    },
    phoneNumbersIncluded: false,
    providerBridgeIdsIncluded: false,
    secretsIncluded: false,
  });
}
