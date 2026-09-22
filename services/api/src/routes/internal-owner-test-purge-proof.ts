// TEMPORARY W88 PROOF PATH -- REMOVE BEFORE FINAL W88 TREE.
//
// Exists only to execute the real recording-archive purge inside the deployed
// Preview runtime, where the R2 and data-encryption env values already live.
// Those values are Sensitive in Vercel and must never be extracted locally, so
// the destructive proof has to run server-side.
//
// Scope is deliberately narrow: it invokes the real
// purgeRecordingArchiveSession() for one explicitly named session at one
// explicitly named synthetic instant. It is not a generic delete-object API and
// not a command runner. It returns only the service's own verdict string.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireInternalOwnerTestAuthorization } from '../lib/internal-owner-test.ts';
import { purgeRecordingArchiveSession } from '../services/recording-archive.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PurgeProofBody {
  recordingSessionId?: unknown;
  futureNow?: unknown;
}

export async function runRecordingArchivePurgeProof(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  requireInternalOwnerTestAuthorization(req);

  const body = await readJson<PurgeProofBody>(req);

  const recordingSessionId = typeof body.recordingSessionId === 'string' ? body.recordingSessionId.trim() : '';
  if (!UUID_PATTERN.test(recordingSessionId)) throw new HttpError(400, 'recording_session_id_invalid');

  // A synthetic instant is mandatory: the proof must state the exact time it is
  // evaluating eligibility at, rather than silently inheriting wall-clock now.
  const futureNowRaw = typeof body.futureNow === 'string' ? body.futureNow.trim() : '';
  if (!futureNowRaw) throw new HttpError(400, 'future_now_required');
  const futureNow = new Date(futureNowRaw);
  if (!Number.isFinite(futureNow.getTime())) throw new HttpError(400, 'future_now_invalid');

  const result = await purgeRecordingArchiveSession(recordingSessionId, futureNow);

  sendJson(res, 200, {
    ok: true,
    recordingSessionId,
    futureNow: futureNow.toISOString(),
    result,
  });
}
