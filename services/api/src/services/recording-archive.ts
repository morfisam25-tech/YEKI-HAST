import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import {
  decryptRecordingArchiveReference,
  deleteR2ArchiveObject,
  encryptRecordingArchiveReference,
  realtimeKitArchiveObjectKey,
  r2ArchiveObjectExists,
  requireR2ArchiveConfig,
  type RecordingArchiveReference,
} from '../lib/recording-archive-r2.ts';
import { getCloudflareRealtimeKitRecordingDetails } from '../providers/recording-realtimekit.ts';

export interface PersistedArchiveReference {
  reference: RecordingArchiveReference;
  ciphertext: string;
  keyVersion: string;
}

export async function reconcileRealtimeKitArchiveReference(input: {
  recordingSessionId: string;
  providerRecordingId: string;
}): Promise<PersistedArchiveReference | null> {
  const config = requireR2ArchiveConfig();
  const details = await getCloudflareRealtimeKitRecordingDetails(input.providerRecordingId);
  if (details.providerStatus !== 'UPLOADED' || !details.outputFileName) return null;

  const key = realtimeKitArchiveObjectKey(details.outputFileName, config.path);
  const exists = await r2ArchiveObjectExists(key, config);
  if (!exists) return null;

  const reference: RecordingArchiveReference = { version: 1, bucket: config.bucket, key };
  const encrypted = encryptRecordingArchiveReference(reference);

  // REST reconciliation fallback: if the status webhook has not inserted its
  // segment row yet, create metadata from the authoritative provider details.
  // No provider download URL is persisted.
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string; storage_reference_ciphertext: string | null }>(`
      SELECT id::text, storage_reference_ciphertext
      FROM private_data.call_recording_segments
      WHERE recording_session_id=$1 AND provider_output_id=$2
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE
    `, [input.recordingSessionId, input.providerRecordingId]);

    if (existing.rows[0]) {
      if (!existing.rows[0].storage_reference_ciphertext) {
        await client.query(`
          UPDATE private_data.call_recording_segments
          SET storage_reference_ciphertext=$2, encryption_key_version=$3, state='stored'::app.recording_state,
              started_at=COALESCE(started_at,$4::timestamptz),
              ended_at=COALESCE(ended_at,$5::timestamptz),
              duration_seconds=COALESCE(duration_seconds,$6),
              bytes=COALESCE(bytes,$7),
              updated_at=now()
          WHERE id=$1
        `, [
          existing.rows[0].id,
          encrypted.ciphertext,
          encrypted.keyVersion,
          details.startedAt,
          details.stoppedAt,
          details.recordingDurationSeconds,
          details.fileSizeBytes,
        ]);
      }
    } else {
      await client.query(`
        INSERT INTO private_data.call_recording_segments(
          recording_session_id, provider_output_id, storage_reference_ciphertext, encryption_key_version,
          state, started_at, ended_at, duration_seconds, bytes
        ) VALUES ($1,$2,$3,$4,'stored'::app.recording_state,$5,$6,$7,$8)
      `, [
        input.recordingSessionId,
        input.providerRecordingId,
        encrypted.ciphertext,
        encrypted.keyVersion,
        details.startedAt,
        details.stoppedAt,
        details.recordingDurationSeconds,
        details.fileSizeBytes,
      ]);
    }
  });

  return { reference, ciphertext: encrypted.ciphertext, keyVersion: encrypted.keyVersion };
}

export async function loadRecordingArchiveReference(input: {
  recordingSessionId: string;
  providerRecordingId: string;
}): Promise<RecordingArchiveReference | null> {
  const result = await query<{
    storage_reference_ciphertext: string | null;
    encryption_key_version: string | null;
  }>(`
    SELECT storage_reference_ciphertext, encryption_key_version
    FROM private_data.call_recording_segments
    WHERE recording_session_id=$1 AND provider_output_id=$2
    ORDER BY created_at ASC
    LIMIT 1
  `, [input.recordingSessionId, input.providerRecordingId]);

  const row = result.rows[0];
  if (row?.storage_reference_ciphertext) {
    return decryptRecordingArchiveReference(row.storage_reference_ciphertext, row.encryption_key_version);
  }

  const reconciled = await reconcileRealtimeKitArchiveReference(input);
  return reconciled?.reference ?? null;
}

export function isRecordingArchivePurgeEligible(input: {
  legalHold: boolean;
  purgeEligibleAt: string | null;
  purgedAt: string | null;
}, now: Date): boolean {
  if (input.legalHold || input.purgedAt || !input.purgeEligibleAt) return false;
  const at = new Date(input.purgeEligibleAt);
  return Number.isFinite(at.getTime()) && at.getTime() <= now.getTime();
}

// Legal-hold aware destructive path. The recording-session row is locked for
// the entire object-delete + state-update operation, so a concurrent hold
// request must wait and cannot slip between eligibility check and deletion.
export async function purgeRecordingArchiveSession(
  recordingSessionId: string,
  now: Date = new Date(),
): Promise<'purged' | 'not_eligible'> {
  return withTransaction(async (client) => {
    const session = await client.query<{
      legal_hold: boolean;
      purge_eligible_at: string | null;
      purged_at: string | null;
    }>(`
      SELECT legal_hold, purge_eligible_at::text, purged_at::text
      FROM private_data.call_recording_sessions
      WHERE id=$1
      FOR UPDATE
    `, [recordingSessionId]);
    const row = session.rows[0];
    if (!row || !isRecordingArchivePurgeEligible({
      legalHold: row.legal_hold,
      purgeEligibleAt: row.purge_eligible_at,
      purgedAt: row.purged_at,
    }, now)) {
      return 'not_eligible';
    }

    const segments = await client.query<{
      id: string;
      storage_reference_ciphertext: string | null;
      encryption_key_version: string | null;
    }>(`
      SELECT id::text, storage_reference_ciphertext, encryption_key_version
      FROM private_data.call_recording_segments
      WHERE recording_session_id=$1
      FOR UPDATE
    `, [recordingSessionId]);

    const config = requireR2ArchiveConfig();
    for (const segment of segments.rows) {
      if (!segment.storage_reference_ciphertext) continue;
      const reference = decryptRecordingArchiveReference(
        segment.storage_reference_ciphertext,
        segment.encryption_key_version,
      );
      if (reference.bucket !== config.bucket) {
        throw new Error('recording_archive_bucket_mismatch');
      }
      await deleteR2ArchiveObject(reference.key, config);
    }

    await client.query(`
      UPDATE private_data.call_recording_segments
      SET storage_reference_ciphertext=NULL, encryption_key_version=NULL,
          state='purged'::app.recording_state, updated_at=now()
      WHERE recording_session_id=$1
    `, [recordingSessionId]);
    await client.query(`
      UPDATE private_data.call_recording_sessions
      SET state='purged'::app.recording_state, purged_at=$2::timestamptz, updated_at=now()
      WHERE id=$1 AND legal_hold=false
    `, [recordingSessionId, now.toISOString()]);

    return 'purged';
  });
}
