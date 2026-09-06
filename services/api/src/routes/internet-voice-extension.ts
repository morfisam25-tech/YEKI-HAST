import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';
import {
  authorizationMinorForSeconds,
  requireInternetVoiceExtensionSeconds,
  sessionTiming,
} from '../domain/session-policy.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function extendInternetVoiceCall(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  if (!UUID_RE.test(rawCallId)) throw new HttpError(400, 'invalid_call');
  const { userId } = await requireAuth(req);
  const body = await readJson<{
    extensionMinutes?: unknown;
    clientRequestId?: unknown;
  }>(req);
  const clientRequestId = requireString(body.clientRequestId, 'clientRequestId', 8, 100);

  let extensionSeconds: 900 | 1800;
  try {
    extensionSeconds = requireInternetVoiceExtensionSeconds(Number(body.extensionMinutes) * 60);
  } catch {
    throw new HttpError(400, 'invalid_extension_minutes');
  }

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      status: string;
      transport: string | null;
      caller_user_id: string;
      currency_code: string;
      caller_rate: string;
      authorized_minor: string;
      max_billable_seconds: number | null;
      connected_at: string | null;
    }>(`
      SELECT id::text, status::text, transport::text, caller_user_id::text,
             currency_code, caller_rate_per_minute_minor::text caller_rate,
             authorized_minor::text, max_billable_seconds, connected_at::text
      FROM app.call_sessions
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [rawCallId, userId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    if (row.transport !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');
    if (row.status !== 'connected' || !row.connected_at || !row.max_billable_seconds) {
      throw new HttpError(409, 'call_not_extendable');
    }

    const idempotencyKey = `call:${row.id}:extend:${clientRequestId}`;
    const prior = await client.query<{
      amount_minor: string;
      metadata: { extensionSeconds?: number; maxBillableSecondsAfter?: number } | null;
    }>(`
      SELECT amount_minor::text, metadata
      FROM app.wallet_hold_events
      WHERE idempotency_key=$1
      LIMIT 1
    `, [idempotencyKey]);
    if (prior.rows[0]) {
      const latest = await client.query<{ authorized_minor: string; max_billable_seconds: number }>(`
        SELECT authorized_minor::text, max_billable_seconds
        FROM app.call_sessions
        WHERE id=$1
      `, [row.id]);
      const current = latest.rows[0];
      return {
        idempotent: true,
        extensionSeconds: Number(prior.rows[0].metadata?.extensionSeconds ?? extensionSeconds),
        additionalHoldMinor: prior.rows[0].amount_minor,
        authorizedMinor: current.authorized_minor,
        maxBillableSeconds: current.max_billable_seconds,
        connectedAt: row.connected_at,
      };
    }

    const additionalHold = authorizationMinorForSeconds(BigInt(row.caller_rate), extensionSeconds);
    const wallet = await client.query<{
      id: string;
      balance_minor: string;
      reserved_minor: string;
    }>(`
      SELECT id::text, balance_minor::text, reserved_minor::text
      FROM app.wallets
      WHERE user_id=$1 AND currency_code=$2
      FOR UPDATE
    `, [row.caller_user_id, row.currency_code]);
    const walletRow = wallet.rows[0];
    if (!walletRow) throw new HttpError(503, 'wallet_unavailable');
    const available = BigInt(walletRow.balance_minor) - BigInt(walletRow.reserved_minor);
    if (available < additionalHold) throw new HttpError(402, 'insufficient_balance_for_extension');

    const newAuthorized = BigInt(row.authorized_minor) + additionalHold;
    const newMaxBillableSeconds = row.max_billable_seconds + extensionSeconds;

    const reserved = await client.query(`
      UPDATE app.wallets
      SET reserved_minor=reserved_minor+$2::bigint, version=version+1, updated_at=now()
      WHERE id=$1 AND balance_minor-reserved_minor >= $2::bigint
      RETURNING id
    `, [walletRow.id, additionalHold.toString()]);
    if (!reserved.rowCount) throw new HttpError(409, 'wallet_extension_reservation_conflict');

    const updated = await client.query(`
      UPDATE app.call_sessions
      SET authorized_minor=$2::bigint,
          max_billable_seconds=$3,
          updated_at=now()
      WHERE id=$1 AND status='connected' AND transport='internet_voice'
      RETURNING id
    `, [row.id, newAuthorized.toString(), newMaxBillableSeconds]);
    if (!updated.rowCount) throw new HttpError(409, 'call_extension_conflict');

    await client.query(`
      INSERT INTO app.wallet_hold_events(
        wallet_id, call_session_id, currency_code, event_type,
        amount_minor, reason_code, idempotency_key, metadata
      ) VALUES ($1,$2,$3,'extend',$4,'internet_voice_extension',$5,$6::jsonb)
    `, [
      walletRow.id,
      row.id,
      row.currency_code,
      additionalHold.toString(),
      idempotencyKey,
      JSON.stringify({
        extensionSeconds,
        maxBillableSecondsBefore: row.max_billable_seconds,
        maxBillableSecondsAfter: newMaxBillableSeconds,
      }),
    ]);

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'connected','api',$2::jsonb)
    `, [row.id, JSON.stringify({
      reason: 'internet_voice_session_extended',
      transport: 'internet_voice',
      extensionSeconds,
      additionalHoldMinor: additionalHold.toString(),
      maxBillableSeconds: newMaxBillableSeconds,
    })]);

    return {
      idempotent: false,
      extensionSeconds,
      additionalHoldMinor: additionalHold.toString(),
      authorizedMinor: newAuthorized.toString(),
      maxBillableSeconds: newMaxBillableSeconds,
      connectedAt: row.connected_at,
    };
  });

  const timing = sessionTiming({
    status: 'connected',
    connectedAt: result.connectedAt,
    maxBillableSeconds: result.maxBillableSeconds,
  });

  sendJson(res, result.idempotent ? 200 : 201, {
    ok: true,
    callId: rawCallId,
    transport: 'internet_voice',
    extensionMinutes: result.extensionSeconds / 60,
    additionalHoldMinor: result.additionalHoldMinor,
    authorizedMinor: result.authorizedMinor,
    maxBillableSeconds: result.maxBillableSeconds,
    timing,
    idempotent: result.idempotent,
  });
}
