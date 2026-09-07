import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../packages/db/migrations/0006_internet_voice_server_sweeper.sql', import.meta.url),
  'utf8',
);
const transportMigration = await readFile(
  new URL('../packages/db/migrations/0003_internet_voice_transport.sql', import.meta.url),
  'utf8',
);
const migrate = await readFile(
  new URL('../packages/db/src/migrate.ts', import.meta.url),
  'utf8',
);
const voice = await readFile(
  new URL('../services/api/src/routes/internet-voice.ts', import.meta.url),
  'utf8',
);
const ready = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');

test('migration runner includes the DB-owned Internet Voice sweeper after v1.2 schema migrations', () => {
  assert.match(
    migrate,
    /0005_no_answer_hold_idempotency\.sql[\s\S]*0006_internet_voice_server_sweeper\.sql/,
  );
  assert.match(migration, /current_setting\('cron\.database_name', true\)/);
  assert.match(migration, /internet_voice_pg_cron_database_not_configured/);
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
});

test('server scheduler is dynamic, low-idle-cost, and DB-owned', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION app\.ensure_internet_voice_sweeper_job\(\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION app\.stop_internet_voice_sweeper_if_idle\(\)/);
  assert.match(migration, /pg_advisory_xact_lock\(742019912\)/);
  assert.match(
    migration,
    /cron\.schedule\([\s\S]*yeki_hast_internet_voice_sweep[\s\S]*'10 seconds'/,
  );
  assert.match(migration, /PERFORM app\.stop_internet_voice_sweeper_if_idle\(\)/);
  assert.match(migration, /call_sessions_internet_voice_sweeper_job/);
  assert.match(migration, /AFTER UPDATE OF status, transport ON app\.call_sessions/);
  assert.doesNotMatch(
    migration,
    /SELECT cron\.schedule\(\s*'yeki_hast_internet_voice_sweep'\s*,\s*'\* \* \* \* \*'/,
  );
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
  assert.match(
    migration,
    /v_billable_seconds := \(\(v_connected_seconds \+ v_increment - 1\) \/ v_increment\) \* v_increment/,
  );
  assert.match(
    migration,
    /v_charge := \(v_call\.caller_rate_per_minute_minor \* v_billable_seconds \+ 59\) \/ 60/,
  );
  assert.match(
    migration,
    /v_earning := \(v_call\.listener_rate_per_minute_minor \* v_billable_seconds\) \/ 60/,
  );
  assert.match(
    migration,
    /IF v_charge > v_authorized THEN RAISE EXCEPTION 'settlement_exceeds_authorization'/,
  );
  assert.match(migration, /reserved_minor=reserved_minor-v_authorized/);
});

test('voice API persists server timestamps for offer start and explicit Listener answer', () => {
  assert.match(voice, /voice_offer_started_at=COALESCE\(voice_offer_started_at,now\(\)\)/);
  assert.match(voice, /kind === 'answer' && role === 'listener'/);
  assert.match(
    voice,
    /voice_listener_answered_at=COALESCE\(voice_listener_answered_at,now\(\)\)/,
  );
});

test('production readiness accepts an idle unscheduled sweeper but requires a valid job while calls are active', () => {
  assert.match(ready, /extname='pg_cron'/);
  assert.match(ready, /current_setting\('cron\.database_name', true\)=current_database\(\)/);
  assert.match(ready, /sweep_internet_voice_sessions\(integer\)/);
  assert.match(ready, /ensure_internet_voice_sweeper_job\(\)/);
  assert.match(ready, /stop_internet_voice_sweeper_if_idle\(\)/);
  assert.match(ready, /jobname='yeki_hast_internet_voice_sweep'/);
  assert.match(ready, /schedule='10 seconds'/);
  assert.match(ready, /activeVoiceCalls > 0 && validJobs !== 1/);
  assert.match(ready, /invalidJobs > 0/);
});

test('readiness pins migration 0006 to its exact SHA-256', () => {
  const hash = createHash('sha256').update(migration).digest('hex');
  assert.match(ready, new RegExp(hash));
});

test('Iran pricing migration never writes the generated platform-spread column directly', () => {
  const pricingUpdate = transportMigration.slice(
    transportMigration.indexOf('UPDATE app.pricing_plans pp'),
  );
  assert.doesNotMatch(pricingUpdate, /platform_spread_per_minute_minor\s*=/);
  assert.match(pricingUpdate, /caller_rate_per_minute_minor=40000/);
  assert.match(pricingUpdate, /listener_rate_per_minute_minor=28000/);
});

test('sweeper partial index uses enum comparisons that PostgreSQL accepts', () => {
  const start = migration.indexOf('CREATE INDEX IF NOT EXISTS call_sessions_internet_voice_sweep_idx');
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION app.expire_internet_voice_preconnect');
  const indexSql = migration.slice(start, end);
  assert.match(indexSql, /WHERE transport='internet_voice'/);
  assert.match(indexSql, /status IN \('calling_listener','connected'\)/);
  assert.doesNotMatch(indexSql, /transport::text|status::text/);
});

test('no-answer HOLD release uses one canonical idempotency key across API, trigger and sweeper', () => {
  assert.match(transportMigration, /:hold:release:no_answer/);
  assert.match(migration, /:hold:release:no_answer/);
  assert.match(voice, /:hold:release:no_answer/);
  assert.doesNotMatch(transportMigration, /:hold:no_answer_release/);
  assert.equal((transportMigration.match(/:hold:release:no_answer/g) ?? []).length, 1);
  assert.ok((migration.match(/:hold:release:no_answer/g) ?? []).length >= 1);
  assert.ok((voice.match(/:hold:release:no_answer/g) ?? []).length >= 1);
});
