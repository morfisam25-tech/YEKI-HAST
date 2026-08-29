import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiEntry = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');
const deployWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');

test('live readiness requires critical application schema, not just database connectivity', () => {
  for (const relation of [
    "app.users",
    "private_data.auth_sessions",
    "app.pricing_plans",
    "app.audit_logs",
    "private_data.email_otp_challenges",
  ]) {
    assert.ok(apiEntry.includes(`to_regclass('${relation}')`), `missing readiness relation: ${relation}`);
  }
  assert.match(apiEntry, /schema: 'ready'/);
  assert.doesNotMatch(apiEntry, /await pool\.query\('SELECT 1'\);\s*sendJson\(res, 200, \{ ok: true, database: 'ready' \}\)/);
});

test('readiness and bootstrap leave safe internal diagnostics while public failures stay generic', () => {
  assert.match(apiEntry, /readiness_database_url_missing/);
  assert.match(apiEntry, /readiness_schema_incomplete/);
  assert.match(apiEntry, /readiness_database_query_failed/);
  assert.match(apiEntry, /bootstrap_database_url_missing/);
  assert.match(apiEntry, /bootstrap_active_market_pricing_missing/);
  assert.match(apiEntry, /sendJson\(res, 503, \{ ok: false, error: 'service_not_ready' \}\)/);
  assert.match(apiEntry, /sendJson\(res, 503, \{ error: 'service_not_ready' \}\)/);
  assert.doesNotMatch(apiEntry, /console\.(?:log|error|warn)\([^\n]*(connectionString|DATABASE_URL)/);
});

test('schema-incomplete diagnostic exposes relation readiness booleans but no database values', () => {
  assert.match(apiEntry, /users: Boolean\(row\?\.users_ready\)/);
  assert.match(apiEntry, /sessions: Boolean\(row\?\.sessions_ready\)/);
  assert.match(apiEntry, /pricing: Boolean\(row\?\.pricing_ready\)/);
  assert.match(apiEntry, /audit: Boolean\(row\?\.audit_ready\)/);
  assert.match(apiEntry, /emailOtp: Boolean\(row\?\.email_otp_ready\)/);
});

test('production deployment smoke requires schema-ready response', () => {
  assert.match(deployWorkflow, /body\?\.database === 'ready' && body\?\.schema === 'ready'/);
});
