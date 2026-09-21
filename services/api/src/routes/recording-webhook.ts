import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { canTransitionRecordingState, purgeEligibleAt, type RecordingState } from '../../../../packages/domain/src/recording.ts';
import { HttpError, readRawBody, sendJson } from '../lib/http.ts';
import { recordingRetentionDays } from '../lib/recording-config.ts';
import { verifyRealtimeKitWebhookSignature } from '../lib/recording-webhook-signature.ts';
import {
  createCloudflareRealtimeKitProvider,
  normalizeRealtimeKitFileSize,
  normalizeRealtimeKitRecordingDuration,
} from '../providers/recording-realtimekit.ts';

// W81A — RealtimeKit `recording.statusUpdate` webhook receiver. Verified
// 2026-09-19 against developers.cloudflare.com/realtime/realtimekit/
// webhooks/ (headers, signature scheme, retry semantics, camelCase event
// payload shape) and recording-guide/monitor-status/ (status vocabulary).
//
// Security: every request is verified against `rtk-signature` (RSA-SHA256
// over the *raw* body -- see lib/recording-webhook-signature.ts) before any
// part of the parsed payload is trusted. An unverified request is rejected
// with 401 and never reaches the database.
//
// Idempotency: RealtimeKit retries on 5xx/network errors and may otherwise
// redeliver, so every effect here is safe to repeat. State transitions are
// guarded by canTransitionRecordingState (a no-op if already applied), and a
// segment row is only inserted if one for this (session, provider_output_id)
// pair does not already exist. `rtk-uuid` is additionally recorded in
// app.audit_logs as a best-effort duplicate-delivery check (see
// alreadyProcessed() below) -- this is NOT a uniqueness-constrained dedupe
// (app.audit_logs has no unique index to enforce that), so under true
// concurrent redelivery a race is possible; the guarded state
// transitions/segment lookup above are what make that race harmless rather
// than incorrect. A hard-guaranteed dedupe would need a unique index (schema
// work) -- deliberately not added here to avoid a migration-number conflict
// with the concurrent W78 branch; see the W81A final report for this exact
// gap.
export async function handleRealtimeKitRecordingWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawBody = await readRawBody(req);
  const signature = req.headers['rtk-signature'];
  const rtkUuid = req.headers['rtk-uuid'];
  const signatureValue = Array.isArray(signature) ? signature[0] : signature;
  const rtkUuidValue = Array.isArray(rtkUuid) ? rtkUuid[0] : rtkUuid;

  if (!rtkUuidValue) throw new HttpError(400, 'missing_rtk_uuid');

  const verified = await verifyRealtimeKitWebhookSignature(rawBody, signatureValue);
  if (!verified) {
    // Audited so a burst of forged/misconfigured deliveries is visible
    // operationally, without ever recording the (unverified, untrusted) body.
    await query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (NULL,'recording_webhook_signature_invalid','recording_webhook',$1,'{}'::jsonb)
    `, [rtkUuidValue]).catch(() => undefined);
    throw new HttpError(401, 'invalid_signature');
  }

  let payload: { event?: unknown; recording?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json');
  }

  if (payload.event !== 'recording.statusUpdate') {
    // Not an event this endpoint acts on. Still 200: RealtimeKit only
    // retries on 5xx/network failure, and an unhandled-but-valid event type
    // is not a failure (matches Cloudflare's own documented handler
    // pattern -- see this route's header comment).
    sendJson(res, 200, { ok: true, handled: false });
    return;
  }

  const recording = payload.recording ?? {};
  const providerRecordingId = typeof recording.recordingId === 'string'
    ? recording.recordingId
    : typeof recording.id === 'string' ? recording.id : null;
  const providerStatus = typeof recording.status === 'string' ? recording.status : null;
  if (!providerRecordingId || !providerStatus) throw new HttpError(400, 'invalid_recording_payload');

  const alreadyProcessed = await query(`
    SELECT 1 FROM app.audit_logs WHERE action='recording_webhook_processed' AND entity_id=$1 LIMIT 1
  `, [rtkUuidValue]);
  if (alreadyProcessed.rowCount) {
    sendJson(res, 200, { ok: true, handled: true, duplicate: true });
    return;
  }

  const provider = createCloudflareRealtimeKitProvider();
  const normalized = provider.normalizeStatus(providerStatus);
  const startedTime = typeof recording.startedTime === 'string' ? recording.startedTime : null;
  const stoppedTime = typeof recording.stoppedTime === 'string' ? recording.stoppedTime : null;
  const recordingDuration = normalizeRealtimeKitRecordingDuration(recording.recordingDuration);
  // RealtimeKit webhook fixtures include an integer byte count as a string.
  // Accept that strict representation without coercing decimals or exponents.
  const fileSize = normalizeRealtimeKitFileSize(recording.fileSize, true);

  const result = await withTransaction(async (client) => {
    const session = await client.query<{ id: string; state: string }>(`
      SELECT id::text, state::text FROM private_data.call_recording_sessions
      WHERE provider='cloudflare_realtimekit' AND provider_recording_id=$1
      FOR UPDATE
    `, [providerRecordingId]);
    const sessionRow = session.rows[0];
    if (!sessionRow) return { matched: false, recordingSessionId: null as string | null };

    const from = sessionRow.state as RecordingState;
    let target: RecordingState | null = null;
    if (normalized === 'stored') target = 'stored';
    else if (normalized === 'uploading') target = 'uploading';
    else if (normalized === 'failed') target = 'failed';

    if (target && canTransitionRecordingState(from, target)) {
      if (target === 'stored') {
        const retentionUntil = purgeEligibleAt(new Date(), recordingRetentionDays());
        await client.query(`
          UPDATE private_data.call_recording_sessions
          SET state='stored'::app.recording_state, updated_at=now(),
              ended_at=COALESCE(ended_at, $2::timestamptz, now()),
              retention_until=COALESCE(retention_until, $3::timestamptz),
              purge_eligible_at=COALESCE(purge_eligible_at, $3::timestamptz)
          WHERE id=$1
        `, [sessionRow.id, stoppedTime, retentionUntil.toISOString()]);
      } else if (target === 'uploading') {
        await client.query(`
          UPDATE private_data.call_recording_sessions
          SET state='uploading'::app.recording_state, updated_at=now()
          WHERE id=$1
        `, [sessionRow.id]);
      } else {
        await client.query(`
          UPDATE private_data.call_recording_sessions
          SET state='failed'::app.recording_state, failure_code='cloudflare_realtimekit_recording_errored',
              updated_at=now(), ended_at=COALESCE(ended_at, $2::timestamptz, now())
          WHERE id=$1
        `, [sessionRow.id, stoppedTime]);
      }
    }

    // Evidence-metadata segment row (private_data.call_recording_segments):
    // duration/size/timing only, deterministic from the verified webhook
    // payload. storage_reference_ciphertext is deliberately left NULL -- it
    // is this platform's *own* durable archive reference, which does not
    // exist yet (see providers/recording-playback-resolver.ts). The
    // transient RealtimeKit download URLs are never written here or
    // anywhere else (see this route's header comment).
    const existingSegment = await client.query(`
      SELECT 1 FROM private_data.call_recording_segments
      WHERE recording_session_id=$1 AND provider_output_id=$2
    `, [sessionRow.id, providerRecordingId]);
    if (!existingSegment.rowCount) {
      await client.query(`
        INSERT INTO private_data.call_recording_segments(
          recording_session_id, provider_output_id, state, started_at, ended_at, duration_seconds, bytes
        ) VALUES ($1,$2,$3::app.recording_state,$4,$5,$6,$7)
      `, [
        sessionRow.id,
        providerRecordingId,
        normalized,
        startedTime,
        stoppedTime,
        recordingDuration,
        fileSize,
      ]);
    }

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (NULL,'recording_webhook_processed','recording_webhook',$1,jsonb_build_object(
        'recordingSessionId',$2::text,'providerStatus',$3::text,'normalizedState',$4::text
      ))
    `, [rtkUuidValue, sessionRow.id, providerStatus, normalized]);

    return { matched: true, recordingSessionId: sessionRow.id };
  });

  if (!result.matched) {
    await query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (NULL,'recording_webhook_unmatched','recording_webhook',$1,jsonb_build_object('providerRecordingId',$2::text))
    `, [rtkUuidValue, providerRecordingId]).catch(() => undefined);
  }

  sendJson(res, 200, { ok: true, handled: true, matched: result.matched });
}
