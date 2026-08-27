import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, sendJson } from '../lib/http.ts';

function readLimit(url: URL): number {
  const raw = url.searchParams.get('limit') ?? '50';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new HttpError(400, 'invalid_limit');
  return value;
}

export async function listAdminCalls(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = readLimit(url);
  const status = url.searchParams.get('status')?.trim() || null;

  const calls = await query<{
    id: string;
    caller_user_id: string;
    listener_user_id: string | null;
    status: string;
    requested_listener_gender: string;
    caller_mood: string | null;
    topic_code: string | null;
    currency_code: string;
    authorized_minor: string;
    caller_rate_per_minute_minor: string;
    listener_rate_per_minute_minor: string;
    telephony_provider: string | null;
    recording_mode: string;
    requested_at: string;
    connected_at: string | null;
    billing_started_at: string | null;
    ended_at: string | null;
    billable_seconds: number;
    caller_charge_minor: string;
    listener_earning_minor: string;
    ended_reason: string | null;
    updated_at: string;
  }>(`
    SELECT id::text, caller_user_id::text, listener_user_id::text, status::text,
           requested_listener_gender::text, caller_mood::text, topic_code,
           currency_code, authorized_minor::text,
           caller_rate_per_minute_minor::text, listener_rate_per_minute_minor::text,
           telephony_provider, recording_mode::text, requested_at::text,
           connected_at::text, billing_started_at::text, ended_at::text,
           billable_seconds, caller_charge_minor::text, listener_earning_minor::text,
           ended_reason, updated_at::text
    FROM app.call_sessions
    WHERE ($1::text IS NULL OR status::text=$1)
    ORDER BY requested_at DESC
    LIMIT $2
  `, [status, limit]);

  sendJson(res, 200, {
    ok: true,
    filters: { status, limit },
    calls: calls.rows.map((row) => ({
      id: row.id,
      callerUserId: row.caller_user_id,
      listenerUserId: row.listener_user_id,
      status: row.status,
      requestedListenerGender: row.requested_listener_gender,
      callerMood: row.caller_mood,
      topicCode: row.topic_code,
      currencyCode: row.currency_code,
      authorizedMinor: row.authorized_minor,
      callerRatePerMinuteMinor: row.caller_rate_per_minute_minor,
      listenerRatePerMinuteMinor: row.listener_rate_per_minute_minor,
      telephonyProvider: row.telephony_provider,
      recordingMode: row.recording_mode,
      requestedAt: row.requested_at,
      connectedAt: row.connected_at,
      billingStartedAt: row.billing_started_at,
      endedAt: row.ended_at,
      billableSeconds: row.billable_seconds,
      callerChargeMinor: row.caller_charge_minor,
      listenerEarningMinor: row.listener_earning_minor,
      endedReason: row.ended_reason,
      updatedAt: row.updated_at,
      phoneNumbersIncluded: false,
      providerBridgeIdIncluded: false,
    })),
  });
}
