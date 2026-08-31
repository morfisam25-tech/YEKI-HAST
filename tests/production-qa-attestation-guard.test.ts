import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const frontendWorkflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');
const migrationWorkflow = await readFile(new URL('../.github/workflows/migrate-production-db.yml', import.meta.url), 'utf8');
const qaWorkflow = await readFile(new URL('../.github/workflows/foundation-qa.yml', import.meta.url), 'utf8');
const gate = await readFile(new URL('../scripts/require-green-foundation-qa.mjs', import.meta.url), 'utf8');

test('every production mutation workflow requires an Actions-readable green Foundation QA ancestor', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow, migrationWorkflow]) {
    assert.match(workflow, /actions: read/);
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(workflow, /node scripts\/require-green-foundation-qa\.mjs/);
  }
});

test('QA attestation happens before each production mutation', () => {
  const migrationQa = migrationWorkflow.indexOf('Require successful Foundation QA coverage for this source');
  const migrationApply = migrationWorkflow.indexOf('Apply repository migrations exactly once');
  const apiQa = apiWorkflow.indexOf('Require successful Foundation QA coverage for this source');
  const apiEnv = apiWorkflow.indexOf('Sync exact API production environment to UNIQUE');
  const frontendQa = frontendWorkflow.indexOf('Require successful Foundation QA coverage for this source');
  const frontendWebDeploy = frontendWorkflow.indexOf('Deploy prebuilt Web artifact to protected UNIQUE production');

  assert.ok(migrationQa >= 0 && migrationApply > migrationQa);
  assert.ok(apiQa >= 0 && apiEnv > apiQa);
  assert.ok(frontendQa >= 0 && frontendWebDeploy > frontendQa);
});

test('QA attestation accepts only successful main Foundation QA coverage with metadata-only drift', () => {
  assert.match(gate, /actions\/workflows\/foundation-qa\.yml\/runs/);
  assert.match(gate, /url\.searchParams\.set\('branch', 'main'\)/);
  assert.match(gate, /url\.searchParams\.set\('status', 'success'\)/);
  assert.match(gate, /run\?\.conclusion !== 'success'/);
  assert.match(gate, /merge-base', '--is-ancestor'/);
  assert.match(gate, /diff', '--name-only'/);
  assert.match(gate, /path\.startsWith\('\.launch\/'\)/);
  assert.match(gate, /path\.startsWith\('docs\/'\)/);
  assert.match(gate, /changed\.every\(metadataOnly\)/);
});

test('Foundation QA syntax-checks the release attestation and the gate does not log its token', () => {
  assert.match(qaWorkflow, /node --check scripts\/require-green-foundation-qa\.mjs/);
  assert.doesNotMatch(gate, /console\.log\([^\n]*(token|authorization)/i);
  assert.doesNotMatch(gate, /console\.error\([^\n]*(token|authorization)/i);
});
