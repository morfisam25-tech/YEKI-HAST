import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(
  new URL('../.github/workflows/deploy-production-api.yml', import.meta.url),
  'utf8',
);
const frontendWorkflow = await readFile(
  new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url),
  'utf8',
);

test('manual production deploys require exact confirmation phrases', () => {
  assert.match(apiWorkflow, /description: 'Type DEPLOY-PRODUCTION-API to confirm manual release'/);
  assert.match(apiWorkflow, /github\.event\.inputs\.confirm/);
  assert.match(apiWorkflow, /GITHUB_EVENT_NAME.*workflow_dispatch/);
  assert.match(apiWorkflow, /DEPLOY-PRODUCTION-API/);

  assert.match(frontendWorkflow, /description: 'Type DEPLOY-PRODUCTION-FRONTENDS to confirm manual release'/);
  assert.match(frontendWorkflow, /github\.event\.inputs\.confirm/);
  assert.match(frontendWorkflow, /GITHUB_EVENT_NAME.*workflow_dispatch/);
  assert.match(frontendWorkflow, /DEPLOY-PRODUCTION-FRONTENDS/);
});

test('API validates and bundles source before mutating Vercel production environment', () => {
  const qaGate = apiWorkflow.indexOf('Require successful Foundation QA coverage for this source');
  const dbGate = apiWorkflow.indexOf('Verify production database without migrations');
  const bundle = apiWorkflow.indexOf('Bundle production API runtime');
  const envSync = apiWorkflow.indexOf('Sync exact API production environment to UNIQUE');
  const deploy = apiWorkflow.indexOf('Deploy prebuilt API artifact to UNIQUE production');

  assert.ok(qaGate >= 0, 'Foundation QA gate missing');
  assert.ok(dbGate > qaGate, 'DB verification must follow QA attestation');
  assert.ok(bundle > dbGate, 'API bundle must follow DB verification');
  assert.ok(envSync > bundle, 'Vercel env mutation must happen only after source bundle succeeds');
  assert.ok(deploy > envSync, 'deployment must happen after environment sync');
});
