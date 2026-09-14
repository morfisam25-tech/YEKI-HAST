import type { QueryResultRow } from 'pg';

// Deliberately narrower than PoolClient's real (overloaded) `query` type: a
// plain PoolClient and the shared `query` helper each satisfy this single
// signature structurally, which lets recording/media-session orchestration
// accept either a transaction's PoolClient or the top-level `query` function
// interchangeably. Extracted from services/recording-lifecycle.ts (W58) so
// services/call-media-session.ts (W60) can share it without importing
// recording-lifecycle.ts back (that module now imports this one).
export interface SqlClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}
