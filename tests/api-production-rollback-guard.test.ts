import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');

test('API release captures the current production deployment before Vercel mutation', () => {
  const capture = workflow.indexOf('Capture current API production deployment for rollback');
  const envSync = workflow.indexOf('Sync exact API production environment to UNIQUE');
  const deploy = workflow.indexOf('Deploy prebuilt API artifact to UNIQUE production');
  assert.ok(capture >= 0 && envSync > capture && deploy > envSync);
  assert.match(workflow, /https:\/\/api\.vercel\.com\/v6\/deployments/);
  assert.match(workflow, /target', 'production'/);
  assert.match(workflow, /state', 'READY'/);
  assert.match(workflow, /deployment_id=\$\{deploymentId\}/);
  assert.doesNotMatch(workflow, /console\.log\([^\n]*(VERCEL_TOKEN|Bearer \$\{token\})/);
});

test('API release requests rollback only after a deployed release fails post-deploy verification', () => {
  assert.match(workflow, /id: deploy_api/);
  assert.match(workflow, /Roll back API production if post-deploy verification fails/);
  assert.match(workflow, /failure\(\) && steps\.deploy_api\.outcome == 'success'/);
  assert.match(workflow, /steps\.previous_api\.outputs\.deployment_id/);
  assert.match(workflow, /https:\/\/api\.vercel\.com\/v1\/projects\/\$\{encodeURIComponent\(projectId\)\}\/rollback\/\$\{encodeURIComponent\(deploymentId\)\}/);
  assert.match(workflow, /method: 'POST'/);
  assert.match(workflow, /production rollback requested to previous verified deployment/);
});

test('rollback target stays pinned to the same project and team', () => {
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy/);
  assert.match(workflow, /VERCEL_TEAM_ID: team_GmseY3ibD05FWemVhLElL3hI/);
  assert.match(workflow, /url\.searchParams\.set\('teamId', teamId\)/);
});
