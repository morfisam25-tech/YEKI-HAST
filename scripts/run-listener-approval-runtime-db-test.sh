#!/usr/bin/env bash
# W87 Listener onboarding/approval P0 runtime proof.
# Provisions a throwaway local PostgreSQL cluster, applies the repository's
# canonical current migration set, runs the real route handlers, then deletes
# the cluster. It never points at Production or a shared Preview database.
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

export DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/$DBNAME"
node --experimental-strip-types "$ROOT_DIR/packages/db/src/migrate.ts" >/dev/null

export LISTENER_APPROVAL_RUNTIME_DB_URL="$DATABASE_URL"
node --test --experimental-strip-types "$ROOT_DIR/tests/listener-approval-runtime-db.test.ts"
