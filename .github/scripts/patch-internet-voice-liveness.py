from pathlib import Path
import hashlib
import re

migration_path = Path('packages/db/migrations/0006_internet_voice_server_sweeper.sql')
migration = migration_path.read_text()

old_columns = """ALTER TABLE app.call_sessions
  ADD COLUMN IF NOT EXISTS voice_offer_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS voice_listener_answered_at timestamptz;
"""
new_columns = """ALTER TABLE app.call_sessions
  ADD COLUMN IF NOT EXISTS voice_offer_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS voice_listener_answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS caller_voice_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS listener_voice_heartbeat_at timestamptz;
"""
if old_columns not in migration:
    raise SystemExit('voice timestamp columns target not found')
migration = migration.replace(old_columns, new_columns, 1)

backfill_anchor = """WHERE cs.transport='internet_voice'
  AND cs.status='calling_listener'
  AND cs.voice_offer_started_at IS NULL;

CREATE INDEX IF NOT EXISTS call_sessions_internet_voice_sweep_idx
"""
backfill_replacement = """WHERE cs.transport='internet_voice'
  AND cs.status='calling_listener'
  AND cs.voice_offer_started_at IS NULL;

-- Existing connected rows, if any exist in a pre-release/staging database, receive a fresh
-- grace point when this migration is applied. New connections set both timestamps directly
-- when both participants report media connected.
UPDATE app.call_sessions
SET caller_voice_heartbeat_at=COALESCE(caller_voice_heartbeat_at,now()),
    listener_voice_heartbeat_at=COALESCE(listener_voice_heartbeat_at,now())
WHERE transport='internet_voice'
  AND status='connected';

CREATE INDEX IF NOT EXISTS call_sessions_internet_voice_sweep_idx
"""
if backfill_anchor not in migration:
    raise SystemExit('heartbeat backfill anchor not found')
migration = migration.replace(backfill_anchor, backfill_replacement, 1)

index_anchor = """  WHERE transport='internet_voice'
    AND status IN ('calling_listener','connected');

CREATE OR REPLACE FUNCTION app.expire_internet_voice_preconnect(
"""
index_replacement = """  WHERE transport='internet_voice'
    AND status IN ('calling_listener','connected');

CREATE INDEX IF NOT EXISTS call_sessions_internet_voice_liveness_idx
  ON app.call_sessions(caller_voice_heartbeat_at,listener_voice_heartbeat_at,connected_at,id)
  WHERE transport='internet_voice'
    AND status='connected';

CREATE OR REPLACE FUNCTION app.expire_internet_voice_preconnect(
"""
if index_anchor not in migration:
    raise SystemExit('liveness index anchor not found')
migration = migration.replace(index_anchor, index_replacement, 1)

old_signature = """CREATE OR REPLACE FUNCTION app.settle_internet_voice_call(
  p_call_id uuid,
  p_ended_reason text,
  p_ended_by_role text,
  p_safety boolean DEFAULT false
)
"""
new_signature = """CREATE OR REPLACE FUNCTION app.settle_internet_voice_call(
  p_call_id uuid,
  p_ended_reason text,
  p_ended_by_role text,
  p_safety boolean DEFAULT false,
  p_effective_end_at timestamptz DEFAULT NULL
)
"""
if old_signature not in migration:
    raise SystemExit('settlement signature target not found')
migration = migration.replace(old_signature, new_signature, 1)

old_decl = """  v_increment integer;
  v_connected_seconds integer;
  v_billable_seconds integer;
"""
new_decl = """  v_increment integer;
  v_observed_end_at timestamptz;
  v_connected_seconds integer;
  v_billable_seconds integer;
"""
if old_decl not in migration:
    raise SystemExit('settlement declaration target not found')
migration = migration.replace(old_decl, new_decl, 1)

old_duration = """  v_connected_seconds := LEAST(
    v_call.max_billable_seconds,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-v_call.connected_at)))::integer)
  );
"""
new_duration = """  -- Normal end/safety/cap settlement observes now(). A liveness timeout may provide
  -- an earlier server-observed end so crash/network-detection grace is not billed.
  v_observed_end_at := LEAST(now(),COALESCE(p_effective_end_at,now()));
  IF v_observed_end_at < v_call.connected_at THEN
    v_observed_end_at := v_call.connected_at;
  END IF;
  v_connected_seconds := LEAST(
    v_call.max_billable_seconds,
    GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (v_observed_end_at-v_call.connected_at)))::integer)
  );
"""
if old_duration not in migration:
    raise SystemExit('settlement duration target not found')
migration = migration.replace(old_duration, new_duration, 1)

metadata_anchor = """      'endedByRole',p_ended_by_role,
      'connectedSecondsObserved',v_connected_seconds,
"""
metadata_replacement = """      'endedByRole',p_ended_by_role,
      'effectiveEndAt',v_observed_end_at,
      'connectedSecondsObserved',v_connected_seconds,
"""
if metadata_anchor not in migration:
    raise SystemExit('settlement metadata target not found')
migration = migration.replace(metadata_anchor, metadata_replacement, 1)

old_returns = """RETURNS TABLE(
  no_answer_expired integer,
  connect_timeout_expired integer,
  cap_settled integer
)
"""
new_returns = """RETURNS TABLE(
  no_answer_expired integer,
  connect_timeout_expired integer,
  liveness_settled integer,
  cap_settled integer
)
"""
if old_returns not in migration:
    raise SystemExit('sweeper return target not found')
migration = migration.replace(old_returns, new_returns, 1)

old_vars = """  v_no_answer integer := 0;
  v_connect_timeout integer := 0;
  v_cap integer := 0;
"""
new_vars = """  v_no_answer integer := 0;
  v_connect_timeout integer := 0;
  v_liveness integer := 0;
  v_cap integer := 0;
"""
if old_vars not in migration:
    raise SystemExit('sweeper counter target not found')
migration = migration.replace(old_vars, new_vars, 1)

cap_anchor = """  FOR v_call IN
    SELECT id
    FROM app.call_sessions
    WHERE transport='internet_voice'
      AND status='connected'
      AND connected_at IS NOT NULL
      AND max_billable_seconds IS NOT NULL
      AND connected_at + make_interval(secs=>max_billable_seconds) <= now()
"""
liveness_loop = """  -- Connected calls require recent liveness from BOTH participants. Client heartbeats
  -- run around every five seconds; thirty seconds tolerates transient scheduling/network jitter.
  -- Settlement stops at the older of the two latest participant heartbeats, so the detection
  -- grace itself is not charged after one side disappears.
  FOR v_call IN
    SELECT id,
           LEAST(
             COALESCE(caller_voice_heartbeat_at,connected_at),
             COALESCE(listener_voice_heartbeat_at,connected_at)
           ) AS effective_end_at
    FROM app.call_sessions
    WHERE transport='internet_voice'
      AND status='connected'
      AND connected_at IS NOT NULL
      AND connected_at <= now()-interval '30 seconds'
      AND (
        caller_voice_heartbeat_at IS NULL
        OR listener_voice_heartbeat_at IS NULL
        OR caller_voice_heartbeat_at <= now()-interval '30 seconds'
        OR listener_voice_heartbeat_at <= now()-interval '30 seconds'
      )
    ORDER BY LEAST(
      COALESCE(caller_voice_heartbeat_at,connected_at),
      COALESCE(listener_voice_heartbeat_at,connected_at)
    ),id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    PERFORM 1
    FROM app.settle_internet_voice_call(
      v_call.id,
      'internet_voice_liveness_timeout',
      'system',
      false,
      v_call.effective_end_at
    );
    v_liveness := v_liveness+1;
  END LOOP;

""" + cap_anchor
if cap_anchor not in migration:
    raise SystemExit('cap sweep anchor not found')
migration = migration.replace(cap_anchor, liveness_loop, 1)

old_return_query = """  RETURN QUERY SELECT v_no_answer,v_connect_timeout,v_cap;
END;
$$;
"""
new_return_query = """  RETURN QUERY SELECT v_no_answer,v_connect_timeout,v_liveness,v_cap;
END;
$$;
"""
if old_return_query not in migration:
    raise SystemExit('sweeper return query target not found')
migration = migration.replace(old_return_query, new_return_query, 1)

migration_path.write_text(migration)

voice_path = Path('services/api/src/routes/internet-voice.ts')
voice = voice_path.read_text()
old_connected = """          UPDATE app.call_sessions
          SET status='connected', connected_at=COALESCE(connected_at,now()),
              billing_started_at=COALESCE(billing_started_at,now()), updated_at=now()
          WHERE id=$1 AND status='calling_listener' AND transport='internet_voice'
"""
new_connected = """          UPDATE app.call_sessions
          SET status='connected', connected_at=COALESCE(connected_at,now()),
              billing_started_at=COALESCE(billing_started_at,now()),
              caller_voice_heartbeat_at=COALESCE(caller_voice_heartbeat_at,now()),
              listener_voice_heartbeat_at=COALESCE(listener_voice_heartbeat_at,now()),
              updated_at=now()
          WHERE id=$1 AND status='calling_listener' AND transport='internet_voice'
"""
if old_connected not in voice:
    raise SystemExit('connected heartbeat initialization target not found')
voice_path.write_text(voice.replace(old_connected, new_connected, 1))

heartbeat_path = Path('services/api/src/routes/internet-voice-heartbeat.ts')
heartbeat = heartbeat_path.read_text()
terminal_anchor = """  if (TERMINAL_STATUSES.has(row.status)) {
"""
liveness_update = """  if (row.status === 'connected') {
    const heartbeatColumn = role === 'caller' ? 'caller_voice_heartbeat_at' : 'listener_voice_heartbeat_at';
    const updated = await query(`
      UPDATE app.call_sessions
      SET ${heartbeatColumn}=now(), updated_at=now()
      WHERE id=$1 AND status='connected' AND transport='internet_voice'
      RETURNING id
    `, [row.id]);
    if (!updated.rowCount) throw new HttpError(409, 'call_not_live');
  }

""" + terminal_anchor
if terminal_anchor not in heartbeat:
    raise SystemExit('heartbeat liveness insertion anchor not found')
heartbeat_path.write_text(heartbeat.replace(terminal_anchor, liveness_update, 1))

# Pin the exact modified migration in readiness.
api_path = Path('api/index.ts')
api = api_path.read_text()
new_hash = hashlib.sha256(migration.encode()).hexdigest()
api, count = re.subn(
    r"\['0006_internet_voice_server_sweeper\.sql', '[0-9a-f]{64}'\]",
    f"['0006_internet_voice_server_sweeper.sql', '{new_hash}']",
    api,
    count=1,
)
if count != 1:
    raise SystemExit('0006 readiness hash target not found')
api_path.write_text(api)

# Add regression coverage for the monetary liveness invariant.
test_path = Path('tests/internet-voice-liveness.test.ts')
test_path.write_text("""import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../packages/db/migrations/0006_internet_voice_server_sweeper.sql', import.meta.url), 'utf8');
const voice = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');
const heartbeat = await readFile(new URL('../services/api/src/routes/internet-voice-heartbeat.ts', import.meta.url), 'utf8');
const ready = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');

test('both participant liveness timestamps begin only when both sides report media connected', () => {
  assert.match(migration, /caller_voice_heartbeat_at timestamptz/);
  assert.match(migration, /listener_voice_heartbeat_at timestamptz/);
  assert.match(voice, /caller_voice_heartbeat_at=COALESCE\(caller_voice_heartbeat_at,now\(\)\)/);
  assert.match(voice, /listener_voice_heartbeat_at=COALESCE\(listener_voice_heartbeat_at,now\(\)\)/);
  assert.match(voice, /roles\.has\('caller'\) && roles\.has\('listener'\)/);
});

test('heartbeat refreshes only the authenticated participant role instead of both sides', () => {
  assert.match(heartbeat, /heartbeatColumn = role === 'caller' \? 'caller_voice_heartbeat_at' : 'listener_voice_heartbeat_at'/);
  assert.match(heartbeat, /SET \$\{heartbeatColumn\}=now\(\), updated_at=now\(\)/);
  assert.match(heartbeat, /WHERE id=\$1 AND status='connected' AND transport='internet_voice'/);
  assert.doesNotMatch(heartbeat, /SET caller_voice_heartbeat_at=now\(\),\s*listener_voice_heartbeat_at=now\(\)/);
});

test('server sweeper terminates stale connected calls using both-side liveness', () => {
  assert.match(migration, /connected_at <= now\(\)-interval '30 seconds'/);
  assert.match(migration, /caller_voice_heartbeat_at <= now\(\)-interval '30 seconds'/);
  assert.match(migration, /listener_voice_heartbeat_at <= now\(\)-interval '30 seconds'/);
  assert.match(migration, /internet_voice_liveness_timeout/);
  assert.match(migration, /v_liveness := v_liveness\+1/);
});

test('liveness settlement does not bill the crash-detection grace window', () => {
  assert.match(migration, /p_effective_end_at timestamptz DEFAULT NULL/);
  assert.match(migration, /v_observed_end_at := LEAST\(now\(\),COALESCE\(p_effective_end_at,now\(\)\)\)/);
  assert.match(migration, /LEAST\([\s\S]*COALESCE\(caller_voice_heartbeat_at,connected_at\)[\s\S]*COALESCE\(listener_voice_heartbeat_at,connected_at\)/);
  assert.match(migration, /v_call\.effective_end_at/);
});

test('readiness pins the exact liveness-aware migration bytes', () => {
  const hash = createHash('sha256').update(migration).digest('hex');
  assert.match(ready, new RegExp(`0006_internet_voice_server_sweeper\\.sql', '${hash}`));
});
""")
