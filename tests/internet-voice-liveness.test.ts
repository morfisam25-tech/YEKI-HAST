import assert from 'node:assert/strict';
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
  assert.match(ready, new RegExp(`0006_internet_voice_server_sweeper\.sql', '${hash}`));
});
