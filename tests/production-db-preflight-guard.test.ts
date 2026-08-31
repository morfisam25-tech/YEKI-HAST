import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptUrl = new URL('../scripts/preflight-production-db-migration.mjs', import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const script = await readFile(scriptUrl, 'utf8');
const workflow = await readFile(
  new URL('../.github/workflows/migrate-production-db.yml', import.meta.url),
  'utf8',
);

test('production migration preflight has valid JavaScript syntax', () => {
  execFileSync(process.execPath, ['--check', scriptPath], { stdio: 'ignore' });
});

test('production migration preflight is catalog/history read-only', () => {
  assert.match(script, /to_regnamespace\('app'\)/);
  assert.match(script, /to_regnamespace\('private_data'\)/);
  assert.match(script, /to_regclass\('public\.yeki_hast_schema_migrations'\)/);
  assert.match(script, /SELECT filename, sha256/);
  assert.match(script, /f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09/);
  assert.match(script, /3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
});

test('migration workflow runs read-only state preflight before first schema mutation', () => {
  const install = workflow.indexOf('Install workspace dependencies from lock');
  const preflight = workflow.indexOf('Verify production DB migration state read-only');
  const migrate = workflow.indexOf('Apply repository migrations exactly once');
  const verify = workflow.indexOf('Verify migrated production schema read-only');

  assert.ok(install >= 0, 'install step missing');
  assert.ok(preflight > install, 'preflight must run after dependencies are installed');
  assert.ok(migrate > preflight, 'migration must not run before the read-only state preflight');
  assert.ok(verify > migrate, 'post-migration read-only verifier must run after migration');
  assert.match(workflow, /preflight-production-db-migration\.mjs/);
});
