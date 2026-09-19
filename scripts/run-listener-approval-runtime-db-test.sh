#!/usr/bin/env bash
# W87 Listener onboarding/approval P0 runtime proof.
# Provisions a throwaway local PostgreSQL cluster, applies every schema-bearing
# migration required by the current Listener/runtime contract, runs the real
# route handlers, then deletes the cluster. It never points at Production or a
# shared Preview database.
#
# Migrations 0006 and 0009 only register Neon pg_cron jobs and intentionally
# fail closed on plain local PostgreSQL where cron.database_name is unavailable.
# Existing disposable runtime-DB harnesses in this repository skip those two
# environment-specific job-registration migrations while applying the rest in
# order. This harness follows the same local-runtime contract through 0012.
set -euo pipefail

PG_BINDIR="${PG_BINDIR:-/usr/lib/postgresql/16/bin}"
if [ ! -x "$PG_BINDIR/initdb" ]; then
  PG_BINDIR="$(dirname "$(command -v initdb || true)")"
fi
if [ -z "${PG_BINDIR:-}" ] || [ ! -x "$PG_BINDIR/initdb" ]; then
  echo "SKIP: no PostgreSQL server binaries (initdb) available for isolated Listener approval runtime test." >&2
  exit 3
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yeki-listener-approval-pg.XXXXXX")"
PGDATA="$WORK_DIR/data"
PORT="${PG_TEST_PORT:-54331}"
DBNAME="listener_approval_runtime"

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

"${PGRUN[@]}" "$PG_BINDIR/initdb" -D "$PGDATA" -U postgres --auth=trust --no-sync >/dev/null
"${PGRUN[@]}" "$PG_BINDIR/pg_ctl" -D "$PGDATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$WORK_DIR" -w start >/dev/null
"${PGRUN[@]}" "$PG_BINDIR/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$DBNAME"

node "$ROOT_DIR/scripts/materialize-migration.mjs" >/dev/null
for f in 0001_initial.sql 0002_email_auth.sql 0003_internet_voice_transport.sql \
         0004_booking.sql 0005_no_answer_hold_idempotency.sql \
         0007_global_caller_market_feedback.sql 0008_caller_quote_bindings.sql \
         0010_recording_core_foundation.sql 0011_call_media_sessions.sql \
         0012_listener_kyc_field_checks.sql; do
  cat "$ROOT_DIR/packages/db/migrations/$f" \
    | "${PGRUN[@]}" "$PG_BINDIR/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d "$DBNAME" -v ON_ERROR_STOP=1 >/dev/null
done

export LISTENER_APPROVAL_RUNTIME_DB_URL="postgres://postgres@127.0.0.1:$PORT/$DBNAME"
node --test --experimental-strip-types "$ROOT_DIR/tests/listener-approval-runtime-db.test.ts"
