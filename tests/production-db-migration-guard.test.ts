import assert from 'node:assert/strict';
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
const approvalMarker = (
  await readFile(new URL('../.launch/production-db-migration', import.meta.url), 'utf8')
).trim();

const expectedMarker = 'approved=2026-08-30;project=royal-lab-98725266;region=aws-us-east-2';
const endpointFingerprint = '4c067ec8bb706bf10e3cddbdd554aebe90fc7a69cf0d3e6ecbcd0165f662e9cd';
const checkoutAction = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const setupNodeAction = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';

test('production DB migration is explicitly approved for the exact Neon target', () => {
  assert.equal(approvalMarker, expectedMarker);
  assert.match(migrationWorkflow, /\.launch\/production-db-migration/);
  assert.match(migrationWorkflow, /refs\/heads\/main/);
  assert.match(migrationWorkflow, /morfisam25-tech\/YEKI-HAST/);
  assert.match(migrationWorkflow, /royal-lab-98725266/);
  assert.match(migrationWorkflow, /aws-us-east-2/);
  assert.doesNotMatch(migrationWorkflow, /evidence[-_ ]?axis/i);
});

test('manual production DB migration requires a deliberate confirmation phrase', () => {
  assert.match(migrationWorkflow, /workflow_dispatch:/);
  assert.match(migrationWorkflow, /confirm:/);
  assert.match(migrationWorkflow, /required: true/);
  assert.match(migrationWorkflow, /MIGRATE_YEKI_HAST_PRODUCTION/);
  assert.match(migrationWorkflow, /GITHUB_EVENT_NAME.*workflow_dispatch/);
  assert.match(migrationWorkflow, /Manual production migration confirmation did not match/);
});

test('production DB migration uses only the secure repository credential and locked source', () => {
  assert.match(migrationWorkflow, /secrets\.PRODUCTION_DATABASE_URL/);
  assert.ok(migrationWorkflow.includes(checkoutAction));
  assert.ok(migrationWorkflow.includes(setupNodeAction));
  assert.match(migrationWorkflow, /node-version: '22\.23\.1'/);
  assert.match(migrationWorkflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(migrationWorkflow, /echo[^\n]*DATABASE_URL/i);
  assert.doesNotMatch(migrationWorkflow, /console\.log\([^\n]*(password|DATABASE_URL)/i);
});

test('production DB migration pins the exact endpoint fingerprint and transport requirements before mutation', () => {
  assert.match(migrationWorkflow, /\.us-east-2\.aws\.neon\.tech/);
  assert.match(migrationWorkflow, /url\.pathname !== '\/neondb'/);
  assert.match(migrationWorkflow, /sslmode'\) !== 'require'/);
  assert.match(migrationWorkflow, /channel_binding'\) !== 'require'/);
  assert.match(migrationWorkflow, new RegExp(endpointFingerprint));
  assert.match(migrationWorkflow, /createHash\('sha256'\)\.update\(url\.hostname\)/);
  assert.match(migrationWorkflow, /endpoint fingerprint does not match the approved target/);
  assert.doesNotMatch(migrationWorkflow, /ep-[a-z0-9-]+\.c-[0-9]+\.us-east-2\.aws\.neon\.tech/);
});

test('production DB migration is idempotent and followed by read-only verification', () => {
  assert.match(migrationWorkflow, /npm run db:migrate/);
  assert.match(migrationWorkflow, /verify-production-db\.mjs/);
});

test('production API runtime is aligned with the Neon Ohio region', () => {
  assert.match(apiWorkflow, /"regions": \["cle1"\]/);
});
