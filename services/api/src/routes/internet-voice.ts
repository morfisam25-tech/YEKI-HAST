import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import { getCallTransportReadiness, getInternetVoiceClientConfig } from '../providers/call-transport.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = ['routing', 'calling_listener', 'connected'] as const;
const SIGNAL_KINDS = ['offer', 'answer', 'ice', 'media_connected', 'reconnecting', 'reconnected'] as const;
const NO_ANSWER_SECONDS = 90;
const SIGNAL_PAYLOAD_MAX_BYTES = 48_000;

type SignalKind = (typeof SIGNAL_KINDS)[number];
type ParticipantRole = 'caller' | 'listener';

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');
}

function participantRole(row: { caller_user_id: string; listener_user_id: string | null }, userId: string): ParticipantRole {
  if (row.caller_user_id === userId) return 'caller';
  if (row.listener_user_id === userId) return 'listener';
  throw new HttpError(404, 'call_not_found');
}

function assertSignalKind(value: unknown): SignalKind {
  if (typeof value !== 'string' || !SIGNAL_KINDS.includes(value as SignalKind)) {
    throw new HttpError(400, 'invalid_voice_signal_kind');
  }
  return value as SignalKind;
}

function normalizeSignalPayload(value: unknown): unknown {
  if (value === undefined) return null;
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new HttpError(400, 'invalid_voice_signal_payload');
  }
  if (Buffer.byteLength(encoded, 'utf8') > SIGNAL_PAYLOAD_MAX_BYTES) {
    throw new HttpError(413, 'voice_signal_payload_too_large');
  }
  return value;
}

function internetVoiceBridgeId(callId: string): string {
  // Transitional compatibility only: the existing schema names this column provider_bridge_id.
  // Domain/API behavior treats it as an opaque transport session id.
  return `iv:${callId}`;
}

export async function startInternetVoiceCall(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);
  const readiness = getCallTransportReadiness();
  if (readiness.primary !== 'internet_voice') throw new HttpError(409, 'internet_voice_not_primary');

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      id: string;
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      telephony_provider: string | null;
      provider_bridge_id: string | null;
    }>(`
      SELECT id::text, caller_user_id::text, listener_user_id::text, status::text,
             telephony_provider, provider_bridge_id
      FROM app.call_sessions
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [rawCallId, userId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    if (!row.listener_user_id) throw new HttpError(409, 'call_not_dispatchable');

    const expectedBridgeId = internetVoiceBridgeId(row.id);
    if (row.telephony_provider === 'internet_voice' && row.provider_bridge_id === expectedBridgeId) {
      if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
        throw new HttpError(409, 'call_not_active');
      }
      return { idempotent: true, status: row.status, listenerUserId: row.listener_user_id };
    }
    if (row.status !== 'routing') throw new HttpError(409, 'call_cannot_start_voice');
    if (row.provider_bridge_id || row.telephony_provider) throw new HttpError(409, 'call_transport_already_claimed');

    const expiresAt = new Date(Date.now() + NO_ANSWER_SECONDS * 1000).toISOString();
    const updated = await client.query(`
      UPDATE app.call_sessions
      SET status='calling_listener', telephony_provider='internet_voice',
          provider_bridge_id=$2, updated_at=now()
      WHERE id=$1 AND status='routing' AND provider_bridge_id IS NULL
      RETURNING id
    `, [row.id, expectedBridgeId]);
    if (!updated.rowCount) throw new HttpError(409, 'call_voice_start_conflict');

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'calling_listener','api',$2::jsonb)
    `, [row.id, JSON.stringify({
      reason: 'internet_voice_offer_started',
      transport: 'internet_voice',
      expiresAt,
      noAnswerSeconds: NO_ANSWER_SECONDS,
    })]);

    return { idempotent: false, status: 'calling_listener', listenerUserId: row.listener_user_id };
  });

  sendJson(res, result.idempotent ? 200 : 202, {
    ok: true,
    callId: rawCallId,
    status: result.status,
    transport: 'internet_voice',
    noAnswerSeconds: NO_ANSWER_SECONDS,
    client: getInternetVoiceClientConfig(),
    idempotent: result.idempotent,
  });
}

export async function getInternetVoiceConfig(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);
  const readiness = getCallTransportReadiness();

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      telephony_provider: string | null;
    }>(`
      SELECT caller_user_id::text, listener_user_id::text, status::text, telephony_provider
      FROM app.call_sessions
      WHERE id=$1
    `, [rawCallId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    const role = participantRole(row, userId);
    if (row.telephony_provider !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');
    if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) throw new HttpError(409, 'call_not_active');
    return { role, status: row.status };
  });

  sendJson(res, 200, {
    callId: rawCallId,
    transport: 'internet_voice',
    role: result.role,
    status: result.status,
    noAnswerSeconds: NO_ANSWER_SECONDS,
    client: getInternetVoiceClientConfig(),
    readiness: {
      relayConfigured: readiness.internetVoice.relayConfigured,
      iranDomesticPathConfigured: readiness.internetVoice.iranDomesticPathConfigured,
    },
  });
}

export async function postInternetVoiceSignal(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);
  const body = await readJson<{ kind?: unknown; payload?: unknown }>(req);
  const kind = assertSignalKind(body.kind);
  const payload = normalizeSignalPayload(body.payload);

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      telephony_provider: string | null;
    }>(`
      SELECT caller_user_id::text, listener_user_id::text, status::text, telephony_provider
      FROM app.call_sessions
      WHERE id=$1
      FOR UPDATE
    `, [rawCallId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    const role = participantRole(row, userId);
    if (row.telephony_provider !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');
    if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) throw new HttpError(409, 'call_not_active');

    if (kind === 'offer' && role !== 'caller') throw new HttpError(403, 'voice_offer_caller_only');
    if (kind === 'answer' && role !== 'listener') throw new HttpError(403, 'voice_answer_listener_only');

    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,$2::app.call_status,'api',$3::jsonb)
    `, [rawCallId, row.status, JSON.stringify({
      reason: 'internet_voice_signal',
      transport: 'internet_voice',
      signalKind: kind,
      senderRole: role,
      payload,
    })]);

    let status = row.status;
    let becameConnected = false;
    if (kind === 'media_connected' && row.status !== 'connected') {
      const connectedRoles = await client.query<{ role: string }>(`
        SELECT DISTINCT metadata->>'senderRole' AS role
        FROM app.call_events
        WHERE call_session_id=$1
          AND metadata->>'reason'='internet_voice_signal'
          AND metadata->>'transport'='internet_voice'
          AND metadata->>'signalKind'='media_connected'
          AND metadata->>'senderRole' IN ('caller','listener')
      `, [rawCallId]);
      const roles = new Set(connectedRoles.rows.map((item) => item.role));
      if (roles.has('caller') && roles.has('listener')) {
        const updated = await client.query(`
          UPDATE app.call_sessions
          SET status='connected', connected_at=COALESCE(connected_at,now()),
              billing_started_at=COALESCE(billing_started_at,now()), updated_at=now()
          WHERE id=$1 AND status='calling_listener'
          RETURNING id
        `, [rawCallId]);
        if (updated.rowCount) {
          status = 'connected';
          becameConnected = true;
          await client.query(`
            INSERT INTO app.call_events(call_session_id, status, source, metadata)
            VALUES ($1,'connected','api',$2::jsonb)
          `, [rawCallId, JSON.stringify({
            reason: 'both_sides_media_connected',
            transport: 'internet_voice',
          })]);
        }
      }
    }

    return { role, status, becameConnected };
  });

  sendJson(res, 202, {
    ok: true,
    callId: rawCallId,
    transport: 'internet_voice',
    role: result.role,
    signalKind: kind,
    status: result.status,
    becameConnected: result.becameConnected,
  });
}

export async function getInternetVoiceSignals(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      telephony_provider: string | null;
    }>(`
      SELECT caller_user_id::text, listener_user_id::text, status::text, telephony_provider
      FROM app.call_sessions
      WHERE id=$1
    `, [rawCallId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    const role = participantRole(row, userId);
    if (row.telephony_provider !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');

    const signals = await client.query<{
      created_at: string;
      signal_kind: string;
      sender_role: string;
      payload: unknown;
    }>(`
      SELECT created_at::text,
             metadata->>'signalKind' AS signal_kind,
             metadata->>'senderRole' AS sender_role,
             metadata->'payload' AS payload
      FROM app.call_events
      WHERE call_session_id=$1
        AND metadata->>'reason'='internet_voice_signal'
        AND metadata->>'transport'='internet_voice'
      ORDER BY created_at DESC
      LIMIT 200
    `, [rawCallId]);

    return { role, status: row.status, signals: signals.rows.reverse() };
  });

  sendJson(res, 200, {
    callId: rawCallId,
    transport: 'internet_voice',
    role: result.role,
    status: result.status,
    signals: result.signals.map((signal) => ({
      createdAt: signal.created_at,
      kind: signal.signal_kind,
      senderRole: signal.sender_role,
      payload: signal.payload,
    })),
  });
}

export async function expireInternetVoiceNoAnswer(req: IncomingMessage, res: ServerResponse, rawCallId: string) {
  assertCallId(rawCallId);
  const { userId } = await requireAuth(req);

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      caller_user_id: string;
      listener_user_id: string | null;
      status: string;
      telephony_provider: string | null;
      currency_code: string;
      authorized_minor: string;
      product_id: string;
      service_id: string;
      market_id: string;
    }>(`
      SELECT caller_user_id::text, listener_user_id::text, status::text, telephony_provider,
             currency_code, authorized_minor::text, product_id::text, service_id::text, market_id::text
      FROM app.call_sessions
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [rawCallId, userId]);
    const row = call.rows[0];
    if (!row) throw new HttpError(404, 'call_not_found');
    if (row.telephony_provider !== 'internet_voice') throw new HttpError(409, 'call_not_internet_voice');
    if (row.status === 'connected') throw new HttpError(409, 'call_already_connected');
    if (row.status === 'missed') return { status: 'missed', idempotent: true };
    if (row.status !== 'calling_listener') throw new HttpError(409, 'call_not_waiting_for_listener');

    const offer = await client.query<{ elapsed_seconds: number }>(`
      SELECT EXTRACT(EPOCH FROM (now() - created_at))::int AS elapsed_seconds
      FROM app.call_events
      WHERE call_session_id=$1
        AND metadata->>'reason'='internet_voice_offer_started'
      ORDER BY created_at DESC
      LIMIT 1
    `, [rawCallId]);
    const elapsed = Number(offer.rows[0]?.elapsed_seconds ?? 0);
    if (elapsed < NO_ANSWER_SECONDS) throw new HttpError(409, 'no_answer_window_active');

    const listenerAnswered = await client.query(`
      SELECT 1
      FROM app.call_events
      WHERE call_session_id=$1
        AND metadata->>'reason'='internet_voice_signal'
        AND metadata->>'transport'='internet_voice'
        AND metadata->>'signalKind' IN ('answer','media_connected')
        AND metadata->>'senderRole'='listener'
      LIMIT 1
    `, [rawCallId]);
    if (listenerAnswered.rowCount) throw new HttpError(409, 'listener_already_answered');

    const authorized = BigInt(row.authorized_minor);
    if (authorized > 0n) {
      const released = await client.query(`
        UPDATE app.wallets
        SET reserved_minor=reserved_minor-$3::bigint, version=version+1, updated_at=now()
        WHERE user_id=$1 AND currency_code=$2 AND reserved_minor >= $3::bigint
        RETURNING id
      `, [row.caller_user_id, row.currency_code, authorized.toString()]);
      if (!released.rowCount) throw new HttpError(409, 'wallet_release_conflict');
    }

    if (row.listener_user_id) {
      const presence = await client.query<{ current_work_session_id: string | null }>(`
        SELECT current_work_session_id::text
        FROM app.listener_presence
        WHERE listener_user_id=$1 AND product_id=$2 AND service_id=$3 AND market_id=$4
        FOR UPDATE
      `, [row.listener_user_id, row.product_id, row.service_id, row.market_id]);
      const workSessionId = presence.rows[0]?.current_work_session_id ?? null;
      if (workSessionId) {
        await client.query(`
          UPDATE app.listener_work_sessions
          SET ended_at=COALESCE(ended_at,now()), ended_reason=COALESCE(ended_reason,'instant_no_answer')
          WHERE id=$1
        `, [workSessionId]);
      }
      await client.query(`
        UPDATE app.listener_presence
        SET status='offline', current_work_session_id=NULL, online_since=NULL,
            auto_offline_reason='instant_no_answer', updated_at=now()
        WHERE listener_user_id=$1 AND product_id=$2 AND service_id=$3 AND market_id=$4
      `, [row.listener_user_id, row.product_id, row.service_id, row.market_id]);
    }

    await client.query(`
      UPDATE app.call_sessions
      SET status='missed', ended_at=COALESCE(ended_at,now()), ended_reason='internet_voice_no_answer', updated_at=now()
      WHERE id=$1 AND status='calling_listener'
    `, [rawCallId]);
    await client.query(`
      INSERT INTO app.call_events(call_session_id, status, source, metadata)
      VALUES ($1,'missed','api',$2::jsonb)
    `, [rawCallId, JSON.stringify({
      reason: 'internet_voice_no_answer',
      transport: 'internet_voice',
      holdReleased: true,
      listenerAutoOffline: true,
      noAnswerSeconds: NO_ANSWER_SECONDS,
    })]);

    return { status: 'missed', idempotent: false };
  });

  sendJson(res, 200, {
    ok: true,
    callId: rawCallId,
    status: result.status,
    transport: 'internet_voice',
    chargedMinor: 0,
    holdReleased: true,
    listenerAutoOffline: true,
    alternativesAvailable: true,
    idempotent: result.idempotent,
  });
}
