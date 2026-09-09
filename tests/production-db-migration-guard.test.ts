import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationWorkflow = await readFile(
  new URL('../.github/workflows/migrate-production-db.yml', import.meta.url),
  'utf8',
);
const apiWorkflow = await readFile(
  new URL('../.github/workflows/deploy-production-api.yml', import.meta.url),
  'utf8',
);
const productionDbVerifier = await readFile(
  new URL('../scripts/verify-production-db.mjs', import.meta.url),
  'utf8',
);
const migrationManifest = await readFile(
  new URL('../scripts/current-migration-manifest.mjs', import.meta.url),
  'utf8',
);
const sweeperMigration = await readFile(
  new URL('../packages/db/migrations/0006_internet_voice_server_sweeper.sql', import.meta.url),
  'utf8',
);
const apiVercel = JSON.parse(
  await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
);
const approvalMarker = (
  await readFile(new URL('../.launch/production-db-migration', import.meta.url), 'utf8')
).trim();

const sweeperMigrationHash = createHash('sha256').update(sweeperMigration).digest('hex');
const approvedMarker = /^approved=\d{4}-\d{2}-\d{2};project=weathered-bar-87205560;region=aws-us-east-1;host_sha256=e589e6310a67818d2dde702c353e0c94ecf12c4d710d78d6dfd57e4240e364c2$/;
const checkoutAction = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const setupNodeAction = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';

test('production DB approval remains pinned to the verified aws-us-east-1 target', () => {
  assert.match(approvalMarker, approvedMarker);
  assert.match(migrationWorkflow, /Production migration is blocked until the correct Neon aws-us-east-1 project is created and explicitly approved/);
  assert.match(migrationWorkflow, /region=aws-us-east-1/);
  assert.match(migrationWorkflow, /host_sha256=\[0-9a-f\]\{64\}/);
  assert.match(migrationWorkflow, /refs\/heads\/main/);
  assert.match(migrationWorkflow, /morfisam25-tech\/YEKI-HAST/);
  assert.doesNotMatch(migrationWorkflow, /royal-lab-98725266/);
  assert.doesNotMatch(migrationWorkflow, /aws-us-east-2/);
  assert.doesNotMatch(migrationWorkflow, /evidence[-_ ]?axis/i);
});

test('production DB migration is manual-only and requires a deliberate confirmation phrase', () => {
  assert.match(migrationWorkflow, /workflow_dispatch:/);
  assert.match(migrationWorkflow, /confirm:/);
  assert.match(migrationWorkflow, /required: true/);
  assert.match(migrationWorkflow, /MIGRATE_YEKI_HAST_PRODUCTION/);
  assert.match(migrationWorkflow, /GITHUB_EVENT_NAME.*!= 'workflow_dispatch'/);
  assert.match(migrationWorkflow, /Production migration requires a manual dispatch with the exact confirmation phrase/);
  assert.doesNotMatch(migrationWorkflow, /^\s*push:\s*$/m);
  assert.doesNotMatch(migrationWorkflow, /branches:\s*\[main\]/);
});

test('production DB migration uses only the secure repository credential and locked source', () => {
  assert.match(migrationWorkflow, /secrets\.PRODUCTION_DATABASE_URL/);
  assert.ok(migrationWorkflow.includes(checkoutAction));
  assert.ok(migrationWorkflow.includes(setupNodeAction));
  assert.match(migrationWorkflow, /node-version: '22\.23\.1'/);
  assert.match(migrationWorkflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(migrationWorkflow, /\b(?:echo|printf)\b[^\n]*\$\{?DATABASE_URL\b/i);
  assert.doesNotMatch(migrationWorkflow, /\bprintenv\b[^\n]*\bDATABASE_URL\b/i);
  assert.doesNotMatch(migrationWorkflow, /console\.log\([^\n]*(password|DATABASE_URL)/i);
});

test('future production DB approval must pin us-east-1 endpoint fingerprint and transport before mutation or API deploy', () => {
  for (const workflow of [migrationWorkflow, apiWorkflow]) {
    assert.match(workflow, /\.us-east-1\.aws\.neon\.tech/);
    assert.match(workflow, /url\.pathname !== '\/neondb'/);
    assert.match(workflow, /sslmode'\) !== 'require'/);
    assert.match(workflow, /channel_binding'\) !== 'require'/);
    assert.match(workflow, /createHash\('sha256'\)\.update\(url\.hostname\)/);
    assert.doesNotMatch(workflow, /\.us-east-2\.aws\.neon\.tech/);
    assert.doesNotMatch(workflow, /royal-lab-98725266/);
  }
  assert.match(migrationWorkflow, /endpoint fingerprint does not match the approved target/);
  assert.match(apiWorkflow, /production DB target is still blocked pending correct aws-us-east-1 project/);
  assert.match(apiWorkflow, /production DB endpoint fingerprint does not match approved target/);
});

test('production DB migration is idempotent and followed by read-only verification', () => {
  assert.match(migrationWorkflow, /preflight-production-db-migration\.mjs/);
  assert.match(migrationWorkflow, /npm run db:migrate/);
  assert.match(migrationWorkflow, /verify-production-db\.mjs/);
});

test('production DB verifier checks exact migration history and relation existence without regclass display-name assumptions', () => {
  assert.equal(sweeperMigrationHash, '46c8bc4e07420d2ec64192d8ab2aee40f29a42083192d989bcc2bdfef4dfb72b');
  assert.match(migrationManifest, /0006_internet_voice_server_sweeper\.sql/);
  assert.match(migrationManifest, /createHash\('sha256'\)\.update\(sql\)\.digest\('hex'\)/);
  assert.match(productionDbVerifier, /currentMigrationEntries/);
  assert.match(productionDbVerifier, /SELECT filename, sha256[\s\S]*ORDER BY filename/);
  assert.match(productionDbVerifier, /migrationMap\.size !== expectedMigrations\.size/);
  assert.match(productionDbVerifier, /migrationMap\.get\(filename\) !== expectedSha/);
  assert.match(productionDbVerifier, /unexpected production migration record/);
  assert.match(productionDbVerifier, /production migration history is incomplete/);
  assert.match(productionDbVerifier, /to_regclass\(r\.relation_name\) IS NOT NULL AS present/);
  assert.doesNotMatch(productionDbVerifier, /to_regclass\(r\.relation_name\)::text AS resolved/);
});

test('production DB verifier matches the on-demand 10-second Internet Voice sweeper contract', () => {
  assert.match(productionDbVerifier, /settle_internet_voice_call\(uuid,text,text,boolean,timestamptz\)/);
  assert.match(productionDbVerifier, /ensure_internet_voice_sweeper_job\(\)/);
  assert.match(productionDbVerifier, /stop_internet_voice_sweeper_if_idle\(\)/);
  assert.match(productionDbVerifier, /current_setting\('cron\.database_name', true\)=current_database\(\)/);
  assert.match(productionDbVerifier, /schedule='10 seconds'/);
  assert.match(productionDbVerifier, /activeVoiceCalls > 0 && validJobs !== 1/);
  assert.doesNotMatch(productionDbVerifier, /schedule='\* \* \* \* \*'/);
});

test('all API production configuration paths stay aligned with Vercel iad1 while DB target remains us-east-1', () => {
  assert.deepEqual(apiVercel.regions, ['iad1']);
  assert.match(apiWorkflow, /"regions": \["iad1"\]/);
  assert.doesNotMatch(apiWorkflow, /"regions": \["cle1"\]/);
});
