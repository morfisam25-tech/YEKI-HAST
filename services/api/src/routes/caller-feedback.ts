import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATEABLE_STATUSES = new Set(['completed', 'safety_terminated']);

function assertCallId(callId: string): void {
  if (!UUID_RE.test(callId)) throw new HttpError(400, 'invalid_call');
}

function ratingFrom(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'invalid_rating');
  return rating;
}

async function callerCallRelationship(callId: string, userId: string) {
  const result = await query<{
    listener_user_id: string | null;
    service_id: string;
    status: string;
    connected_at: string | null;
  }>(`
    SELECT listener_user_id::text, service_id::text, status::text, connected_at::text
    FROM app.call_sessions
    WHERE id=$1 AND caller_user_id=$2
    LIMIT 1
  `, [callId, userId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'call_not_found');
  if (!row.listener_user_id || !row.connected_at || !RATEABLE_STATUSES.has(row.status)) {
    throw new HttpError(409, 'call_not_rateable');
  }
  return row;
}

export async function getCallerFeedback(req: IncomingMessage, res: ServerResponse, callId: string) {
  assertCallId(callId);
  const { userId } = await requireAuth(req);
  const relation = await callerCallRelationship(callId, userId);
  const [rating, favorite] = await Promise.all([
    query<{ rating: number }>(`
      SELECT rating
      FROM app.call_ratings
      WHERE call_session_id=$1 AND caller_user_id=$2
      LIMIT 1
    `, [callId, userId]),
    query(`
      SELECT 1
      FROM app.caller_favorite_listeners
      WHERE caller_user_id=$1 AND listener_user_id=$2
      LIMIT 1
    `, [userId, relation.listener_user_id]),
  ]);

  sendJson(res, 200, {
    callId,
    listenerId: relation.listener_user_id,
    rating: rating.rows[0]?.rating ?? null,
    favorite: Boolean(favorite.rowCount),
  });
}

export async function setCallerFeedback(req: IncomingMessage, res: ServerResponse, callId: string) {
  assertCallId(callId);
  const { userId } = await requireAuth(req);
  const body = await readJson<{ rating?: unknown; favorite?: unknown }>(req);
  const rating = ratingFrom(body.rating);
  const favorite = body.favorite === undefined
    ? undefined
    : typeof body.favorite === 'boolean'
      ? body.favorite
      : (() => { throw new HttpError(400, 'invalid_favorite'); })();
  if (rating === undefined && favorite === undefined) throw new HttpError(400, 'feedback_empty');
  if (rating === null) throw new HttpError(400, 'invalid_rating');

  const result = await withTransaction(async (client) => {
    const call = await client.query<{
      listener_user_id: string | null;
      service_id: string;
      status: string;
      connected_at: string | null;
    }>(`
      SELECT listener_user_id::text, service_id::text, status::text, connected_at::text
      FROM app.call_sessions
      WHERE id=$1 AND caller_user_id=$2
      FOR UPDATE
    `, [callId, userId]);
    const relation = call.rows[0];
    if (!relation) throw new HttpError(404, 'call_not_found');
    if (!relation.listener_user_id || !relation.connected_at || !RATEABLE_STATUSES.has(relation.status)) {
      throw new HttpError(409, 'call_not_rateable');
    }

    if (rating !== undefined) {
      await client.query(`
        INSERT INTO app.call_ratings(
          call_session_id, caller_user_id, listener_user_id, service_id, rating
        ) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (call_session_id) DO UPDATE SET
          rating=EXCLUDED.rating,
          updated_at=now()
        WHERE app.call_ratings.caller_user_id=EXCLUDED.caller_user_id
          AND app.call_ratings.listener_user_id=EXCLUDED.listener_user_id
          AND app.call_ratings.service_id=EXCLUDED.service_id
      `, [callId, userId, relation.listener_user_id, relation.service_id, rating]);

      const aggregate = await client.query<{ rating_average: string | null; rating_count: string }>(`
        SELECT AVG(rating)::numeric(4,2)::text rating_average,
               COUNT(*)::text rating_count
        FROM app.call_ratings
        WHERE listener_user_id=$1 AND service_id=$2
      `, [relation.listener_user_id, relation.service_id]);
      await client.query(`
        UPDATE app.listener_service_profiles
        SET rating_average=$3::numeric,
            rating_count=$4::integer
        WHERE listener_user_id=$1 AND service_id=$2
      `, [
        relation.listener_user_id,
        relation.service_id,
        aggregate.rows[0]?.rating_average ?? null,
        Number(aggregate.rows[0]?.rating_count ?? 0),
      ]);
    }

    if (favorite === true) {
      await client.query(`
        INSERT INTO app.caller_favorite_listeners(caller_user_id, listener_user_id)
        VALUES ($1,$2)
        ON CONFLICT (caller_user_id, listener_user_id) DO NOTHING
      `, [userId, relation.listener_user_id]);
    } else if (favorite === false) {
      await client.query(`
        DELETE FROM app.caller_favorite_listeners
        WHERE caller_user_id=$1 AND listener_user_id=$2
      `, [userId, relation.listener_user_id]);
    }

    const storedRating = await client.query<{ rating: number }>(`
      SELECT rating
      FROM app.call_ratings
      WHERE call_session_id=$1 AND caller_user_id=$2
      LIMIT 1
    `, [callId, userId]);
    const storedFavorite = await client.query(`
      SELECT 1
      FROM app.caller_favorite_listeners
      WHERE caller_user_id=$1 AND listener_user_id=$2
      LIMIT 1
    `, [userId, relation.listener_user_id]);

    return {
      listenerId: relation.listener_user_id,
      rating: storedRating.rows[0]?.rating ?? null,
      favorite: Boolean(storedFavorite.rowCount),
    };
  });

  sendJson(res, 200, { ok: true, callId, ...result });
}
