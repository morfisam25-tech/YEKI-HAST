import { closePool, query } from '../packages/db/src/client.ts';
import { purgeRecordingArchiveSession } from '../services/api/src/services/recording-archive.ts';

if (process.env.CONFIRM_RECORDING_ARCHIVE_PURGE?.trim().toLowerCase() !== 'true') {
  throw new Error('CONFIRM_RECORDING_ARCHIVE_PURGE=true is required');
}

const rows = await query<{ id: string }>(`
  SELECT id::text
  FROM private_data.call_recording_sessions
  WHERE purge_eligible_at IS NOT NULL
    AND purge_eligible_at <= now()
    AND purged_at IS NULL
    AND legal_hold=false
  ORDER BY purge_eligible_at ASC
  LIMIT 100
`);

let purged = 0;
try {
  for (const row of rows.rows) {
    if (await purgeRecordingArchiveSession(row.id) === 'purged') purged += 1;
  }
  // Counts only. Never print object keys, references, credentials, or signed URLs.
  console.log(JSON.stringify({ ok: true, scanned: rows.rows.length, purged }));
} finally {
  await closePool();
}
