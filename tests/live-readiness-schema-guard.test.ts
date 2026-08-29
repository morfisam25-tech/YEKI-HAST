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

test('production deployment smoke requires schema-ready response', () => {
  assert.match(deployWorkflow, /body\?\.database === 'ready' && body\?\.schema === 'ready'/);
});
