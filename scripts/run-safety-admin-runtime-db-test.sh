#!/usr/bin/env bash
#
# W36 / Task B — real runtime regression evidence for the Safety Admin case
# lifecycle (G1 enum drift).
#
# This boots a THROWAWAY, fully isolated local PostgreSQL 16 cluster, applies the
# canonical migration 0001 (the source of the `app.case_status` enum and the
# app.reports / app.safety_events / app.users / app.admin_users tables), points
# the API db client at it via DATABASE_URL, and runs
# tests/admin-safety-runtime-db.test.ts against it.
#
# It NEVER touches production or any shared database: the cluster lives in a temp
# directory, listens only on 127.0.0.1, and is deleted on exit. If PostgreSQL 16
# server binaries are not available, the runtime test skips itself (see the test
# file); this script only provisions the isolated DB and invokes the test.
#
# Usage:  bash scripts/run-safety-admin-runtime-db-test.sh
set -euo pipefail

PG_BINDIR="${PG_BINDIR:-/usr/lib/postgresql/16/bin}"
if [ ! -x "$PG_BINDIR/initdb" ]; then
  # Fall back to whatever is on PATH.
  PG_BINDIR="$(dirname "$(command -v initdb || true)")"
fi
if [ -z "${PG_BINDIR:-}" ] || [ ! -x "$PG_BINDIR/initdb" ]; then
  echo "SKIP: no PostgreSQL server binaries (initdb) available for isolated runtime test." >&2
  exit 3
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yeki-safety-pg.XXXXXX")"
PGDATA="$WORK_DIR/data"
PORT="${PG_TEST_PORT:-54329}"
DBNAME="safety_admin_runtime"

# initdb/postgres refuse to run as root. When this script is invoked as root,
# run the SERVER-side commands as the unprivileged `postgres` account; the Node
# test connects as an ordinary TCP client and can stay as the invoking user.
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

# Listen only on loopback, ephemeral port, no external exposure.
"${PGRUN[@]}" "$PG_BINDIR/pg_ctl" -D "$PGDATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$WORK_DIR" -w start >/dev/null

"${PGRUN[@]}" "$PG_BINDIR/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$DBNAME"

echo "== applying canonical migration 0001 (materialized) =="
node "$ROOT_DIR/scripts/materialize-migration.mjs" >/dev/null
# Pipe via stdin so the (possibly unprivileged) postgres account does not need
# filesystem read access into the repo tree.
cat "$ROOT_DIR/packages/db/migrations/0001_initial.sql" \
  | "${PGRUN[@]}" "$PG_BINDIR/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d "$DBNAME" -v ON_ERROR_STOP=1 >/dev/null

export SAFETY_ADMIN_RUNTIME_DB_URL="postgres://postgres@127.0.0.1:$PORT/$DBNAME"
echo "== running safety-admin runtime DB tests against isolated DB =="
node --test --experimental-strip-types \
  "$ROOT_DIR/tests/admin-safety-runtime-db.test.ts" \
  "$ROOT_DIR/tests/admin-safety-enforcement-runtime-db.test.ts"
