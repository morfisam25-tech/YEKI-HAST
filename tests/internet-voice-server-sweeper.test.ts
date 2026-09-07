import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../packages/db/migrations/0006_internet_voice_server_sweeper.sql', import.meta.url), 'utf8');
const transportMigration = await readFile(new URL('../packages/db/migrations/0003_internet_voice_transport.sql', import.meta.url), 'utf8');
const migrate = await readFile(new URL('../packages/db/src/migrate.ts', import.meta.url), 'utf8');
const voice = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');
const ready = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');

test('migration runner includes the DB-owned Internet Voice sweeper after v1.2 schema migrations', () => {
  assert.match(migrate, /0005_no_answer_hold_idempotency\.sql[\s\S]*0006_internet_voice_server_sweeper\.sql/);
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(migration, /cron\.schedule\([\s\S]*yeki_hast_internet_voice_sweep[\s\S]*'\* \* \* \* \*'/);
});

test('server sweeper owns no-answer, answered-but-unconnected timeout, and hard cap settlement', () => {
  assert.match(migration, /voice_offer_started_at <= now\(\)-interval '90 seconds'/);
  assert.match(migration, /voice_listener_answered_at <= now\(\)-interval '120 seconds'/);
  assert.match(migration, /internet_voice_no_answer/);
  assert.match(migration, /internet_voice_connect_timeout/);
  assert.match(migration, /connected_at \+ make_interval\(secs=>max_billable_seconds\) <= now\(\)/);
  assert.match(migration, /internet_voice_session_cap_reached/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
});

test('DB settlement mirrors one-second billing arithmetic and never exceeds the authorized cap', () => {
  assert.match(migration, /v_billable_seconds := \(\(v_connected_seconds \+ v_increment - 1\) \/ v_increment\) \* v_increment/);
  assert.match(migration, /v_charge := \(v_call\.caller_rate_per_minute_minor \* v_billable_seconds \+ 59\) \/ 60/);
  assert.match(migration, /v_earning := \(v_call\.listener_rate_per_minute_minor \* v_billable_seconds\) \/ 60/);
  assert.match(migration, /IF v_charge > v_authorized THEN RAISE EXCEPTION 'settlement_exceeds_authorization'/);
  assert.match(migration, /reserved_minor=reserved_minor-v_authorized/);
});

test('voice API persists server timestamps for offer start and explicit Listener answer', () => {
  assert.match(voice, /voice_offer_started_at=COALESCE\(voice_offer_started_at,now\(\)\)/);
  assert.match(voice, /kind === 'answer' && role === 'listener'/);
  assert.match(voice, /voice_listener_answered_at=COALESCE\(voice_listener_answered_at,now\(\)\)/);
});

test('production readiness fails closed unless pg_cron, sweeper function and minute job exist', () => {
  assert.match(ready, /extname='pg_cron'/);
  assert.match(ready, /sweep_internet_voice_sessions\(integer\)/);
  assert.match(ready, /yeki_hast_internet_voice_sweep/);
  assert.match(ready, /schedule='\* \* \* \* \*'/);
});

test('Iran pricing migration never writes the generated platform-spread column directly', () => {
  const pricingUpdate = transportMigration.slice(transportMigration.indexOf('UPDATE app.pricing_plans pp'));
  assert.doesNotMatch(pricingUpdate, /platform_spread_per_minute_minor\s*=/);
  assert.match(pricingUpdate, /caller_rate_per_minute_minor=40000/);
  assert.match(pricingUpdate, /listener_rate_per_minute_minor=28000/);
});
