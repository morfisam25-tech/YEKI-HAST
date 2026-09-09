import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';

const scriptUrl = new URL('../scripts/preflight-production-db-migration.mjs', import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const script = await readFile(scriptUrl, 'utf8');
const migrationManifest = await readFile(
  new URL('../scripts/current-migration-manifest.mjs', import.meta.url),
  'utf8',
);
const initialMigrationPacked = await readFile(
  new URL('../packages/db/migrations/0001_initial.sql.gz.b64', import.meta.url),
  'utf8',
);
const emailMigration = await readFile(
  new URL('../packages/db/migrations/0002_email_auth.sql', import.meta.url),
  'utf8',
);
const sweeperMigration = await readFile(
  new URL('../packages/db/migrations/0006_internet_voice_server_sweeper.sql', import.meta.url),
  'utf8',
);
const workflow = await readFile(
  new URL('../.github/workflows/migrate-production-db.yml', import.meta.url),
  'utf8',
);

const initialMigration = gunzipSync(Buffer.from(initialMigrationPacked.trim(), 'base64')).toString('utf8');
const canonicalMigrationHashes = [
  ['0001_initial.sql', createHash('sha256').update(initialMigration).digest('hex'), 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09'],
  ['0002_email_auth.sql', createHash('sha256').update(emailMigration).digest('hex'), '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90'],
  ['0006_internet_voice_server_sweeper.sql', createHash('sha256').update(sweeperMigration).digest('hex'), '46c8bc4e07420d2ec64192d8ab2aee40f29a42083192d989bcc2bdfef4dfb72b'],
] as const;

test('production migration preflight has valid JavaScript syntax', () => {
  execFileSync(process.execPath, ['--check', scriptPath], { stdio: 'ignore' });
});

test('production migration preflight is catalog/history read-only', () => {
  assert.match(script, /to_regnamespace\('app'\) IS NOT NULL/);
  assert.match(script, /to_regnamespace\('private_data'\) IS NOT NULL/);
  assert.match(script, /to_regclass\('public\.yeki_hast_schema_migrations'\) IS NOT NULL/);
  assert.match(script, /SELECT filename, sha256/);
  assert.match(script, /currentMigrationEntries/);
  assert.match(script, /production migration history is out of order or unexpected/);
  assert.match(script, /sha256 !== expectedSha/);
  for (const [filename, actualHash, expectedHash] of canonicalMigrationHashes) {
    assert.equal(actualHash, expectedHash);
    assert.match(migrationManifest, new RegExp(filename.replace('.', '\\.')));
  }
  assert.match(migrationManifest, /createHash\('sha256'\)\.update\(sql\)\.digest\('hex'\)/);
  assert.match(script, /application schemas exist without tracked initial migration/);
  assert.match(script, /tracked initial migration is missing required application schemas/);
  assert.doesNotMatch(script, /to_regclass\('public\.yeki_hast_schema_migrations'\)::text/);
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
