import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, sendJson } from '../lib/http.ts';
import { decryptPrivateText } from '../lib/security.ts';
import { getTelephonyProvider } from '../providers/telephony.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function dispatchCall(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  const { userId } = await requireAuth(req);
  if (!UUID_RE.test(rawCallId)) throw new HttpError(400, 'invalid_call');

  const claimed = await withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      currency_code: string;
      authorized_minor: string;
      max_billable_seconds: number | null;
      provider_bridge_id: string | null;
    }>(`
      SELECT id::text, caller_user_id::text, listener_user_id::text, status::text,
             currency_code, authorized_minor::text, max_billable_seconds, provider_bridge_id
      FROM app.call_sessions
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [rawCallId, userId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    if (row.provider_bridge_id) return { kind: 'already_dispatched' as const, status: row.status };
    if (row.status !== 'routing') throw new HttpError(409, 'call_cannot_be_dispatched');
    if (!row.listener_user_id || !row.max_billable_seconds || row.max_billable_seconds < 1) {
      throw new HttpError(409, 'call_not_dispatchable');
    }

    const contacts = await client.query<{ user_id: string; phone_e164_ciphertext: string; phone_verified_at: string | null }>(`
      SELECT user_id::text, phone_e164_ciphertext, phone_verified_at::text
      FROM private_data.user_contacts
      WHERE user_id = ANY($1::uuid[])
    `, [[row.caller_user_id, row.listener_user_id]]);
    const byUser = new Map(contacts.rows.map((contact) => [contact.user_id, contact]));
    const caller = byUser.get(row.caller_user_id);
    const listener = byUser.get(row.listener_user_id);
    if (!caller?.phone_verified_at || !listener?.phone_verified_at) {
      throw new HttpError(409, 'verified_phone_required');
    }

    const updated = await client.query(`
      UPDATE app.call_sessions
      SET status='calling_caller', telephony_provider=$2, updated_at=now()
      WHERE id=$1 AND status='routing' AND provider_bridge_id IS NULL
      RETURNING id
    `, [row.id, process.env.TELEPHONY_PROVIDER?.trim() || null]);
    if (!updated.rowCount) throw new HttpError(409, 'call_dispatch_conflict');
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source)
      VALUES ($1,'calling_caller','api')
    `, [row.id]);

    return {
      kind: 'claimed' as const,
      callId: row.id,
      currencyCode: row.currency_code,
      authorizedMinor: row.authorized_minor,
      maxConnectedSeconds: row.max_billable_seconds,
      callerDestination: decryptPrivateText(caller.phone_e164_ciphertext, `user_contacts:phone:${row.caller_user_id}`),
      listenerDestination: decryptPrivateText(listener.phone_e164_ciphertext, `user_contacts:phone:${row.listener_user_id}`),
    };
  });

  if (claimed.kind === 'already_dispatched') {
    sendJson(res, 200, { ok: true, callId: rawCallId, status: claimed.status, idempotent: true });
    return;
  }

  let bridgeId: string;
  try {
    const telephony = getTelephonyProvider();
    const result = await telephony.createBridgeCall({
      callSessionId: claimed.callId,
      callerDestination: claimed.callerDestination,
      listenerDestination: claimed.listenerDestination,
      maxConnectedSeconds: claimed.maxConnectedSeconds,
    });
    bridgeId = result.providerBridgeId;
  } catch {
    await withTransaction(async (client) => {
      const failed = await client.query(`
        UPDATE app.call_sessions
        SET status='failed', ended_at=COALESCE(ended_at, now()), ended_reason='telephony_dispatch_failed', updated_at=now()
        WHERE id=$1 AND status='calling_caller' AND provider_bridge_id IS NULL
        RETURNING caller_user_id::text, currency_code, authorized_minor::text
      `, [claimed.callId]);
      const row = failed.rows[0] as { caller_user_id?: string; currency_code?: string; authorized_minor?: string } | undefined;
      if (!row?.caller_user_id || !row.currency_code || row.authorized_minor === undefined) return;
      const authorized = BigInt(row.authorized_minor);
      if (authorized > 0n) {
        const released = await client.query(`
          UPDATE app.wallets
          SET reserved_minor=reserved_minor-$3::bigint, version=version+1, updated_at=now()
          WHERE user_id=$1 AND currency_code=$2 AND reserved_minor >= $3::bigint
          RETURNING id
        `, [row.caller_user_id, row.currency_code, authorized.toString()]);
        if (!released.rowCount) throw new Error('wallet_release_conflict');
      }
      await client.query(`
        INSERT INTO app.call_events(call_session_id, status, source, metadata)
        VALUES ($1,'failed','telephony',jsonb_build_object('reason','dispatch_failed'))
      `, [claimed.callId]);
    });
    throw new HttpError(503, 'telephony_dispatch_failed');
  }

  const persisted = await query(`
    UPDATE app.call_sessions
    SET provider_bridge_id=$2, updated_at=now()
    WHERE id=$1 AND status='calling_caller' AND provider_bridge_id IS NULL
    RETURNING id
  `, [claimed.callId, bridgeId]);

  if (!persisted.rowCount) {
    try { await getTelephonyProvider().terminateCall(bridgeId, 'dispatch_state_conflict'); } catch {}
    throw new HttpError(409, 'call_dispatch_conflict');
  }

  sendJson(res, 202, { ok: true, callId: claimed.callId, status: 'calling_caller', idempotent: false });
}
