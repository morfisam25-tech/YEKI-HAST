import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const verifier = await readFile(new URL('../scripts/verify-production-db.mjs', import.meta.url), 'utf8');
const migration0010 = await readFile(new URL('../packages/db/migrations/0010_recording_core_foundation.sql', import.meta.url), 'utf8');
const migration0011 = await readFile(new URL('../packages/db/migrations/0011_call_media_sessions.sql', import.meta.url), 'utf8');

// W63 section 12: the read-only production DB verifier (run pre-deploy by
// .github/workflows/deploy-production-api.yml, never mutates Production) knew
// about every pre-W58 relation but nothing from W58's recording core
// foundation (0010) or W60's RealtimeKit call media session table (0011) --
// a migration could be recorded as applied in yeki_hast_schema_migrations
// while the actual recording/media-session tables were dropped or never
// created, and this verifier would still report PASS. Closed by asserting
// the exact relation/enum/trigger names the two migrations actually define.

test('production DB verifier checks every table 0010_recording_core_foundation.sql actually creates', () => {
  for (const relation of [
    'app.call_recording_consents',
    'private_data.call_recording_sessions',
    'private_data.call_recording_segments',
    'app.admin_capabilities',
    'app.recording_playback_grants',
  ]) {
    assert.match(migration0010, new RegExp(`CREATE TABLE IF NOT EXISTS ${relation.replace('.', '\\.')}`), `fixture drift: 0010 no longer creates ${relation}`);
    assert.match(verifier, new RegExp(`'${relation.replace('.', '\\.')}'`), `verifier does not check for ${relation}`);
  }
  assert.match(verifier, /app\.recording_state/);
  assert.match(verifier, /recording_state_enum_values.*!== 11/s);
});

test('production DB verifier checks the table 0011_call_media_sessions.sql actually creates', () => {
  assert.match(migration0011, /CREATE TABLE IF NOT EXISTS app\.call_media_sessions/);
  assert.match(verifier, /'app\.call_media_sessions'/);
  assert.match(verifier, /call_media_sessions_set_updated_at/);
});

test('production DB verifier checks recording-session/segment update triggers from 0010', () => {
  assert.match(migration0010, /CREATE TRIGGER call_recording_sessions_set_updated_at/);
  assert.match(migration0010, /CREATE TRIGGER call_recording_segments_set_updated_at/);
  assert.match(verifier, /call_recording_sessions_set_updated_at/);
  assert.match(verifier, /call_recording_segments_set_updated_at/);
  // These two triggers live on private_data tables, not app -- the trigger
  // query must not be scoped to nspname='app' only, or these checks would be
  // dead code that can never pass against a real database.
  assert.match(verifier, /nspname IN \('app', 'private_data'\)/);
});
