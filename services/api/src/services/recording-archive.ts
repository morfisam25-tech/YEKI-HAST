import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import {
  decryptRecordingArchiveReference,
  deleteR2ArchiveObject,
  encryptRecordingArchiveReference,
  realtimeKitArchiveObjectKey,
  r2ArchiveObjectExists,
  requireR2ArchiveConfig,
  type R2ArchiveConfig,
  type RecordingArchiveReference,
} from '../lib/recording-archive-r2.ts';
import { getCloudflareRealtimeKitRecordingDetails } from '../providers/recording-realtimekit.ts';

export interface PersistedArchiveReference {
  reference: RecordingArchiveReference;
  ciphertext: string;
  keyVersion: string;
}

type ArchiveReconcileStage =
  | 'archive_reconcile_provider_details'
  | 'archive_reconcile_key_derived'
  | 'archive_reconcile_r2_head'
  | 'archive_reconcile_encrypt'
  | 'archive_reconcile_db_write';

function logArchiveReconcileStage(stage: string): void {
  console.info(JSON.stringify({ event: 'recording_archive_diagnostic', stage }));
}

function logArchiveReconcileFailure(stage: ArchiveReconcileStage, error: unknown): void {
  const errorClass = error instanceof Error ? error.constructor.name : typeof error;
  const candidateCode = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : null;
  const safeCode = typeof candidateCode === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(candidateCode)
    ? candidateCode
    : null;
  console.error(JSON.stringify({
    event: 'recording_archive_diagnostic',
    stage: 'archive_reconcile_failed',
    failedStage: stage,
    errorClass,
    errorCode: safeCode,
  }));
}

export async function reconcileRealtimeKitArchiveReference(input: {
  recordingSessionId: string;
  providerRecordingId: string;
}): Promise<PersistedArchiveReference | null> {
  let stage: ArchiveReconcileStage = 'archive_reconcile_provider_details';
  try {
    const config = requireR2ArchiveConfig();
    const details = await getCloudflareRealtimeKitRecordingDetails(input.providerRecordingId);
    logArchiveReconcileStage('archive_reconcile_provider_details_ok');
    if (details.providerStatus !== 'UPLOADED' || !details.outputFileName) return null;

    stage = 'archive_reconcile_key_derived';
    const key = realtimeKitArchiveObjectKey(details.outputFileName, config.path);
    logArchiveReconcileStage('archive_reconcile_key_derived');

    stage = 'archive_reconcile_r2_head';
    logArchiveReconcileStage('archive_reconcile_r2_head_start');
    const exists = await r2ArchiveObjectExists(key, config);
    if (!exists) return null;
    logArchiveReconcileStage('archive_reconcile_r2_head_ok');

    const reference: RecordingArchiveReference = { version: 1, bucket: config.bucket, key };
    stage = 'archive_reconcile_encrypt';
    logArchiveReconcileStage('archive_reconcile_encrypt_start');
    const encrypted = encryptRecordingArchiveReference(reference);
    logArchiveReconcileStage('archive_reconcile_encrypt_ok');

    // REST reconciliation fallback: if the status webhook has not inserted its
    // segment row yet, create metadata from the authoritative provider details.
    // No provider download URL is persisted.
    stage = 'archive_reconcile_db_write';
    logArchiveReconcileStage('archive_reconcile_db_write_start');
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
    logArchiveReconcileStage('archive_reconcile_db_write_ok');

    return { reference, ciphertext: encrypted.ciphertext, keyVersion: encrypted.keyVersion };
  } catch (error) {
    logArchiveReconcileFailure(stage, error);
    throw error;
  }
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

export type RecordingArchivePurgeOutcome = 'purged' | 'not_eligible' | 'archive_unverified';

// Provider states that can never leave a durable object behind: the recording
// failed outright, so there is nothing in R2 to orphan. Anything still in
// flight (INVOKED / RECORDING / UPLOADING / PAUSED) is not proof of absence and
// must block the purge rather than be assumed harmless.
const PROVIDER_STATES_WITHOUT_ARCHIVE = new Set(['ERRORED']);

type SegmentArchiveResolution =
  | { kind: 'delete'; key: string }
  | { kind: 'absent' }
  | { kind: 'unverified' };

// A NULL storage_reference_ciphertext is NOT evidence that the object was
// already deleted -- the common cause is simply that no admin ever played the
// recording, so reconciliation never ran and the reference was never
// persisted. Treating that as "nothing to delete" marks the session purged
// while the real private object survives in R2 forever. So a missing reference
// falls back to the provider's authoritative view of the output.
async function resolveSegmentArchiveObject(
  segment: {
    provider_output_id: string | null;
    storage_reference_ciphertext: string | null;
    encryption_key_version: string | null;
  },
  config: R2ArchiveConfig,
): Promise<SegmentArchiveResolution> {
  if (segment.storage_reference_ciphertext) {
    const reference = decryptRecordingArchiveReference(
      segment.storage_reference_ciphertext,
      segment.encryption_key_version,
    );
    if (reference.bucket !== config.bucket) {
      throw new Error('recording_archive_bucket_mismatch');
    }
    return { kind: 'delete', key: reference.key };
  }

  // No reference and no provider output to ask about: unverifiable.
  if (!segment.provider_output_id) return { kind: 'unverified' };

  const details = await getCloudflareRealtimeKitRecordingDetails(segment.provider_output_id);
  if (details.providerStatus === 'UPLOADED' && details.outputFileName) {
    // Derive the same key the archive reconciliation would have stored. The
    // delete is idempotent, so an object already gone still ends absent.
    return { kind: 'delete', key: realtimeKitArchiveObjectKey(details.outputFileName, config.path) };
  }
  if (PROVIDER_STATES_WITHOUT_ARCHIVE.has(details.providerStatus)) return { kind: 'absent' };
  return { kind: 'unverified' };
}

// Legal-hold aware destructive path. The recording-session row is locked for
// the entire object-delete + state-update operation, so a concurrent hold
// request must wait and cannot slip between eligibility check and deletion.
export async function purgeRecordingArchiveSession(
  recordingSessionId: string,
  now: Date = new Date(),
): Promise<RecordingArchivePurgeOutcome> {
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
      provider_output_id: string | null;
      storage_reference_ciphertext: string | null;
      encryption_key_version: string | null;
    }>(`
      SELECT id::text, provider_output_id, storage_reference_ciphertext, encryption_key_version
      FROM private_data.call_recording_segments
      WHERE recording_session_id=$1
      FOR UPDATE
    `, [recordingSessionId]);

    const config = requireR2ArchiveConfig();

    // Resolve every segment before deleting anything: if a later segment turns
    // out to be unverifiable we must not already have destroyed an earlier
    // one's object while leaving the session unpurged.
    const keys: string[] = [];
    for (const segment of segments.rows) {
      const resolution = await resolveSegmentArchiveObject(segment, config);
      if (resolution.kind === 'unverified') {
        console.error(JSON.stringify({
          event: 'recording_archive_diagnostic',
          stage: 'archive_purge_unverified',
        }));
        return 'archive_unverified';
      }
      if (resolution.kind === 'delete') keys.push(resolution.key);
    }
    for (const key of keys) {
      await deleteR2ArchiveObject(key, config);
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
