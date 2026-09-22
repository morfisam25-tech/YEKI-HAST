#!/usr/bin/env bash
#
# W60 — real runtime regression evidence for the RealtimeKit mobile media
# migration's server-side layer (media session creation/reuse, participant
# auth, cross-call isolation, consent prerequisite) against a real PostgreSQL
# schema, not source text.
#
# Same throwaway-cluster pattern as scripts/run-recording-runtime-db-test.sh
# (W58) -- kept as a separate script rather than editing that one so W58's own
# doc references to it stay valid. Applies the same migration set as that
# script PLUS 0011 (this branch's app.call_media_sessions table). It NEVER
# touches production or any shared database.
#
# Usage:  bash scripts/run-call-media-runtime-db-test.sh
set -euo pipefail

PG_BINDIR="${PG_BINDIR:-/usr/lib/postgresql/16/bin}"
if [ ! -x "$PG_BINDIR/initdb" ]; then
  PG_BINDIR="$(dirname "$(command -v initdb || true)")"
fi
if [ -z "${PG_BINDIR:-}" ] || [ ! -x "$PG_BINDIR/initdb" ]; then
  echo "SKIP: no PostgreSQL server binaries (initdb) available for isolated runtime test." >&2
  exit 3
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yeki-call-media-pg.XXXXXX")"
PGDATA="$WORK_DIR/data"
PORT="${PG_TEST_PORT:-54331}"
DBNAME="call_media_runtime"

PGRUN=()
if [ "$(id -u)" = "0" ]; then
  if command -v runuser >/dev/null 2>&1; then
    PGRUN=(runuser -u postgres --)
  else
    PGRUN=(sudo -u postgres)
  fi
  chown -R postgres "$WORK_DIR"
fi

cleanup() {
  if [ -f "$PGDATA/postmaster.pid" ]; then
    "${PGRUN[@]}" "$PG_BINDIR/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR" || true
}
trap cleanup EXIT

echo "== provisioning isolated PostgreSQL 16 cluster in $WORK_DIR =="
"${PGRUN[@]}" "$PG_BINDIR/initdb" -D "$PGDATA" -U postgres --auth=trust --no-sync >/dev/null
"${PGRUN[@]}" "$PG_BINDIR/pg_ctl" -D "$PGDATA" -l "$WORK_DIR/postgres.log" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=" -w start
"${PGRUN[@]}" "$PG_BINDIR/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$DBNAME"

echo "== applying migrations 0001-0005, 0007, 0008, 0010, 0011 (0006/0009 need Neon pg_cron; skipped, see run-recording-runtime-db-test.sh header) =="
node "$ROOT_DIR/scripts/materialize-migration.mjs" >/dev/null
for f in 0001_initial.sql 0002_email_auth.sql 0003_internet_voice_transport.sql \
         0004_booking.sql 0005_no_answer_hold_idempotency.sql \
         0007_global_caller_market_feedback.sql 0008_caller_quote_bindings.sql \
         0010_recording_core_foundation.sql 0011_call_media_sessions.sql; do
  echo "  -> $f"
  cat "$ROOT_DIR/packages/db/migrations/$f" \
    | "${PGRUN[@]}" "$PG_BINDIR/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d "$DBNAME" -v ON_ERROR_STOP=1 >/dev/null
done

export CALL_MEDIA_RUNTIME_DB_URL="postgres://postgres@127.0.0.1:$PORT/$DBNAME"
echo "== running W60 call-media runtime DB tests against isolated DB =="
node --experimental-strip-types --test "$ROOT_DIR/tests/call-media-runtime-db.test.ts"
