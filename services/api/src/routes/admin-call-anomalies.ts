import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { sendJson } from '../lib/http.ts';

const PRECONNECT_STALE_MINUTES = 5;
const CONNECTED_GRACE_SECONDS = 120;
const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];
const CANCEL_TERMINATION_REASONS = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
];
const SAFETY_TERMINATION_REASONS = [
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];
const TERMINATION_EVENT_REASONS = [...CANCEL_TERMINATION_REASONS, ...SAFETY_TERMINATION_REASONS];

export async function getAdminCallAnomalies(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);

  const dispatchUncertain = await query<{
    id: string;
    status: string;
    telephony_provider: string | null;
    requested_at: string;
    updated_at: string;
  }>(`
    SELECT id::text, status::text, telephony_provider, requested_at::text, updated_at::text
    FROM app.call_sessions
    WHERE status::text='calling_caller'
      AND provider_bridge_id IS NULL
      AND (transport IS NULL OR transport::text='masked_pstn')
    ORDER BY requested_at ASC
    LIMIT 100
  `);

  const cancelTerminationPending = await query<{
    id: string;
    status: string;
    telephony_provider: string | null;
    termination_state: string;
    event_at: string;
    updated_at: string;
  }>(`
    WITH termination_state AS (
      SELECT cs.id,
             cs.status,
             cs.telephony_provider,
             cs.updated_at,
             MAX(ce.created_at) AS event_at,
             BOOL_OR(ce.metadata->>'reason'='cancel_termination_started') AS has_started,
             BOOL_OR(ce.metadata->>'reason'='cancel_termination_result_uncertain') AS has_uncertain,
             BOOL_OR(ce.metadata->>'reason'='cancel_termination_confirmed') AS has_confirmed
      FROM app.call_sessions cs
      JOIN app.call_events ce ON ce.call_session_id=cs.id
      WHERE cs.status::text = ANY($1::text[])
        AND ce.metadata->>'reason' = ANY($2::text[])
      GROUP BY cs.id, cs.status, cs.telephony_provider, cs.updated_at
    )
    SELECT id::text,
           status::text,
           telephony_provider,
           CASE
             WHEN has_confirmed THEN 'confirmed_local_finalize_pending'
             WHEN has_uncertain THEN 'uncertain'
             ELSE 'started_unresolved'
           END AS termination_state,
           event_at::text,
           updated_at::text
    FROM termination_state
    WHERE has_started OR has_uncertain OR has_confirmed
    ORDER BY event_at ASC
    LIMIT 100
  `, [ACTIVE_CALL_STATUSES, CANCEL_TERMINATION_REASONS]);

  const terminationFlowConflicts = await query<{
    id: string;
    status: string;
    event_at: string;
    updated_at: string;
  }>(`
    WITH flow_state AS (
      SELECT cs.id,
             cs.status,
             cs.updated_at,
             MAX(ce.created_at) AS event_at,
             BOOL_OR(ce.metadata->>'reason' = ANY($1::text[])) AS has_cancel,
             BOOL_OR(ce.metadata->>'reason' = ANY($2::text[])) AS has_safety
      FROM app.call_sessions cs
      JOIN app.call_events ce ON ce.call_session_id=cs.id
      WHERE ce.metadata->>'reason' = ANY($3::text[])
      GROUP BY cs.id, cs.status, cs.updated_at
    )
    SELECT id::text, status::text, event_at::text, updated_at::text
    FROM flow_state
    WHERE has_cancel AND has_safety
    ORDER BY event_at ASC
    LIMIT 100
  `, [CANCEL_TERMINATION_REASONS, SAFETY_TERMINATION_REASONS, TERMINATION_EVENT_REASONS]);

  const missingBridge = await query<{
    id: string;
    status: string;
    requested_at: string;
    updated_at: string;
  }>(`
    SELECT id::text, status::text, requested_at::text, updated_at::text
    FROM app.call_sessions
    WHERE status::text IN ('caller_answered','calling_listener','connected')
      AND provider_bridge_id IS NULL
      AND (transport IS NULL OR transport::text='masked_pstn')
    ORDER BY requested_at ASC
    LIMIT 100
  `);

  const stalePreconnect = await query<{
    id: string;
    status: string;
    requested_at: string;
    updated_at: string;
    recovery_eligible: boolean;
  }>(`
    SELECT cs.id::text,
           cs.status::text,
           cs.requested_at::text,
           cs.updated_at::text,
           (
             cs.status::text='routing'
             AND cs.provider_bridge_id IS NULL
             AND cs.connected_at IS NULL
             AND NOT EXISTS (
               SELECT 1
               FROM app.call_events ce
               WHERE ce.call_session_id=cs.id
                 AND ce.metadata->>'reason' = ANY($2::text[])
             )
           ) AS recovery_eligible
    FROM app.call_sessions cs
    WHERE cs.status::text IN ('routing','calling_caller','caller_answered','calling_listener')
      AND cs.updated_at < now() - ($1::int * interval '1 minute')
    ORDER BY cs.updated_at ASC
    LIMIT 100
  `, [PRECONNECT_STALE_MINUTES, TERMINATION_EVENT_REASONS]);

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

  const duplicateActiveCallers = await query<{
    caller_user_id: string;
    active_call_count: number;
    call_ids: string[];
  }>(`
    SELECT caller_user_id::text,
           COUNT(*)::int AS active_call_count,
           ARRAY_AGG(id::text ORDER BY requested_at ASC) AS call_ids
    FROM app.call_sessions
    WHERE status::text = ANY($1::text[])
    GROUP BY caller_user_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, caller_user_id
    LIMIT 100
  `, [ACTIVE_CALL_STATUSES]);

  const duplicateActiveListeners = await query<{
    listener_user_id: string;
    active_call_count: number;
    call_ids: string[];
  }>(`
    SELECT listener_user_id::text,
           COUNT(*)::int AS active_call_count,
           ARRAY_AGG(id::text ORDER BY requested_at ASC) AS call_ids
    FROM app.call_sessions
    WHERE listener_user_id IS NOT NULL
      AND status::text = ANY($1::text[])
    GROUP BY listener_user_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, listener_user_id
    LIMIT 100
  `, [ACTIVE_CALL_STATUSES]);

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
      WHERE status::text = ANY($1::text[])
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
  `, [ACTIVE_CALL_STATUSES]);

  const invariantViolations = await query<{
    id: string;
    status: string;
    issue_code: string;
    authorized_minor: string;
    caller_charge_minor: string;
    listener_earning_minor: string;
    charge_transaction_count: number;
    charge_delta_total: string;
    charge_source_mismatch_count: number;
    earning_row_count: number;
    earning_total: string;
    earning_source_mismatch_count: number;
    updated_at: string;
  }>(`
    WITH financial AS (
      SELECT cs.*,
             COALESCE(wt.charge_transaction_count, 0)::int AS charge_transaction_count,
             COALESCE(wt.charge_delta_total, 0)::bigint AS charge_delta_total,
             COALESCE(wt.charge_source_mismatch_count, 0)::int AS charge_source_mismatch_count,
             COALESCE(le.earning_row_count, 0)::int AS earning_row_count,
             COALESCE(le.earning_total, 0)::bigint AS earning_total,
             COALESCE(le.earning_source_mismatch_count, 0)::int AS earning_source_mismatch_count
      FROM app.call_sessions cs
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS charge_transaction_count,
               COALESCE(SUM(tx.delta_minor), 0)::bigint AS charge_delta_total,
               COUNT(*) FILTER (
                 WHERE w.user_id IS DISTINCT FROM cs.caller_user_id
                    OR tx.currency_code IS DISTINCT FROM cs.currency_code
               )::int AS charge_source_mismatch_count
        FROM app.wallet_transactions tx
        LEFT JOIN app.wallets w ON w.id=tx.wallet_id
        WHERE tx.call_session_id=cs.id AND tx.type='call_charge'
      ) wt ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS earning_row_count,
               COALESCE(SUM(e.amount_minor), 0)::bigint AS earning_total,
               COUNT(*) FILTER (
                 WHERE e.listener_user_id IS DISTINCT FROM cs.listener_user_id
                    OR e.market_id IS DISTINCT FROM cs.market_id
                    OR e.currency_code IS DISTINCT FROM cs.currency_code
               )::int AS earning_source_mismatch_count
        FROM app.listener_earnings e
        WHERE e.call_session_id=cs.id
      ) le ON true
    )
    SELECT id::text,
           status::text,
           CASE
             WHEN listener_user_id IS NOT NULL AND caller_user_id=listener_user_id THEN 'caller_listener_same_user'
             WHEN caller_charge_minor > authorized_minor THEN 'charge_exceeds_authorization'
             WHEN listener_earning_minor > caller_charge_minor THEN 'earning_exceeds_charge'
             WHEN status::text='connected' AND billing_started_at IS NULL THEN 'connected_without_billing_start'
             WHEN status::text = ANY($1::text[]) AND ended_at IS NOT NULL THEN 'active_with_end_time'
             WHEN status::text IN ('completed','missed','cancelled','failed','safety_terminated') AND ended_at IS NULL THEN 'terminal_without_end_time'
             WHEN status::text IN ('missed','cancelled','failed')
                  AND (caller_charge_minor <> 0 OR listener_earning_minor <> 0 OR charge_transaction_count > 0 OR earning_row_count > 0)
               THEN 'unconnected_terminal_has_financials'
             WHEN status::text IN ('completed','safety_terminated') AND caller_charge_minor > 0 AND charge_transaction_count=0
               THEN 'charge_without_wallet_transaction'
             WHEN status::text IN ('completed','safety_terminated') AND caller_charge_minor=0 AND charge_transaction_count>0
               THEN 'unexpected_zero_charge_transaction'
             WHEN status::text IN ('completed','safety_terminated') AND charge_transaction_count>1
               THEN 'duplicate_call_charge_transactions'
             WHEN status::text IN ('completed','safety_terminated') AND charge_delta_total <> -caller_charge_minor
               THEN 'call_charge_amount_mismatch'
             WHEN status::text IN ('completed','safety_terminated') AND charge_source_mismatch_count>0
               THEN 'call_charge_source_mismatch'
             WHEN status::text IN ('completed','safety_terminated') AND listener_earning_minor > 0 AND earning_row_count=0
               THEN 'earning_without_listener_earning'
             WHEN status::text IN ('completed','safety_terminated') AND listener_earning_minor=0 AND earning_row_count>0
               THEN 'unexpected_zero_earning_row'
             WHEN status::text IN ('completed','safety_terminated') AND earning_row_count>1
               THEN 'duplicate_listener_earnings'
             WHEN status::text IN ('completed','safety_terminated') AND earning_total <> listener_earning_minor
               THEN 'listener_earning_amount_mismatch'
             WHEN status::text IN ('completed','safety_terminated') AND earning_source_mismatch_count>0
               THEN 'listener_earning_source_mismatch'
             ELSE 'unknown'
           END AS issue_code,
           authorized_minor::text,
           caller_charge_minor::text,
           listener_earning_minor::text,
           charge_transaction_count,
           charge_delta_total::text,
           charge_source_mismatch_count,
           earning_row_count,
           earning_total::text,
           earning_source_mismatch_count,
           updated_at::text
    FROM financial
    WHERE (listener_user_id IS NOT NULL AND caller_user_id=listener_user_id)
       OR caller_charge_minor > authorized_minor
       OR listener_earning_minor > caller_charge_minor
       OR (status::text='connected' AND billing_started_at IS NULL)
       OR (status::text = ANY($1::text[]) AND ended_at IS NOT NULL)
       OR (status::text IN ('completed','missed','cancelled','failed','safety_terminated') AND ended_at IS NULL)
       OR (
         status::text IN ('missed','cancelled','failed')
         AND (caller_charge_minor <> 0 OR listener_earning_minor <> 0 OR charge_transaction_count > 0 OR earning_row_count > 0)
       )
       OR (
         status::text IN ('completed','safety_terminated')
         AND (
           (caller_charge_minor > 0 AND charge_transaction_count=0)
           OR (caller_charge_minor=0 AND charge_transaction_count>0)
           OR charge_transaction_count>1
           OR charge_delta_total <> -caller_charge_minor
           OR charge_source_mismatch_count>0
           OR (listener_earning_minor > 0 AND earning_row_count=0)
           OR (listener_earning_minor=0 AND earning_row_count>0)
           OR earning_row_count>1
           OR earning_total <> listener_earning_minor
           OR earning_source_mismatch_count>0
         )
       )
    ORDER BY updated_at ASC
    LIMIT 100
  `, [ACTIVE_CALL_STATUSES]);

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    thresholds: {
      preconnectStaleMinutes: PRECONNECT_STALE_MINUTES,
      connectedGraceSeconds: CONNECTED_GRACE_SECONDS,
    },
    counts: {
      dispatchUncertain: dispatchUncertain.rowCount ?? dispatchUncertain.rows.length,
      cancelTerminationPending: cancelTerminationPending.rowCount ?? cancelTerminationPending.rows.length,
      terminationFlowConflicts: terminationFlowConflicts.rowCount ?? terminationFlowConflicts.rows.length,
      missingBridge: missingBridge.rowCount ?? missingBridge.rows.length,
      stalePreconnect: stalePreconnect.rowCount ?? stalePreconnect.rows.length,
      connectedOverrun: connectedOverrun.rowCount ?? connectedOverrun.rows.length,
      duplicateActiveCallers: duplicateActiveCallers.rowCount ?? duplicateActiveCallers.rows.length,
      duplicateActiveListeners: duplicateActiveListeners.rowCount ?? duplicateActiveListeners.rows.length,
      underReservedWallets: underReservedWallets.rowCount ?? underReservedWallets.rows.length,
      invariantViolations: invariantViolations.rowCount ?? invariantViolations.rows.length,
    },
    anomalies: {
      dispatchUncertain: dispatchUncertain.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        telephonyProvider: row.telephony_provider,
        requestedAt: row.requested_at,
        updatedAt: row.updated_at,
        reconciliationRequired: true,
        providerRedispatchAllowed: false,
      })),
      cancelTerminationPending: cancelTerminationPending.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        telephonyProvider: row.telephony_provider,
        terminationState: row.termination_state,
        eventAt: row.event_at,
        updatedAt: row.updated_at,
        reconciliationRequired: row.termination_state !== 'confirmed_local_finalize_pending',
        providerTerminationRetryAllowed: false,
        localFinalizeRetryAllowed: row.termination_state === 'confirmed_local_finalize_pending',
      })),
      terminationFlowConflicts: terminationFlowConflicts.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        eventAt: row.event_at,
        updatedAt: row.updated_at,
        reconciliationRequired: true,
        providerTerminationRetryAllowed: false,
        automaticRepairAllowed: false,
      })),
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
        recoveryEligible: row.recovery_eligible,
      })),
      connectedOverrun: connectedOverrun.rows.map((row) => ({
        callId: row.id,
        status: row.status,
        billingStartedAt: row.billing_started_at,
        maxBillableSeconds: row.max_billable_seconds,
        updatedAt: row.updated_at,
      })),
      duplicateActiveCallers: duplicateActiveCallers.rows.map((row) => ({
        callerUserId: row.caller_user_id,
        activeCallCount: row.active_call_count,
        callIds: row.call_ids,
      })),
      duplicateActiveListeners: duplicateActiveListeners.rows.map((row) => ({
        listenerUserId: row.listener_user_id,
        activeCallCount: row.active_call_count,
        callIds: row.call_ids,
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
        chargeTransactionCount: row.charge_transaction_count,
        chargeDeltaTotal: row.charge_delta_total,
        chargeSourceMismatchCount: row.charge_source_mismatch_count,
        earningRowCount: row.earning_row_count,
        earningTotal: row.earning_total,
        earningSourceMismatchCount: row.earning_source_mismatch_count,
        updatedAt: row.updated_at,
      })),
    },
    phoneNumbersIncluded: false,
    providerBridgeIdsIncluded: false,
    secretsIncluded: false,
    diagnosticsReadOnly: true,
  });
}