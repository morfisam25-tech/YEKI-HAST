import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const frontendWorkflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

const teamId = 'team_GmseY3ibD05FWemVhLElL3hI';
const teamSlug = 'unique-6ff0';
const apiProject = 'prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy';
const webProject = 'prj_afhSiMYpsCfIAxuOmotLAWBvTMDg';
const adminProject = 'prj_l18v3f003ORfiN6hKxYwJbvVPzzC';

function escaped(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

test('production workflows are pinned to the authorized UNIQUE team and exact projects', () => {
  assert.match(apiWorkflow, escaped(teamId));
  assert.match(apiWorkflow, escaped(teamSlug));
  assert.match(apiWorkflow, escaped(apiProject));
  assert.match(frontendWorkflow, escaped(teamId));
  assert.match(frontendWorkflow, escaped(teamSlug));
  assert.match(frontendWorkflow, escaped(webProject));
  assert.match(frontendWorkflow, escaped(adminProject));
  assert.doesNotMatch(apiWorkflow, /evidence[-_ ]?axis/i);
  assert.doesNotMatch(frontendWorkflow, /evidence[-_ ]?axis/i);
});

test('production workflows refuse non-main refs and use the tested Vercel CLI version', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow]) {
    assert.match(workflow, /refs\/heads\/main/);
    assert.match(workflow, /morfisam25-tech\/YEKI-HAST/);
    assert.match(workflow, /vercel@59\.3\.0/);
    assert.doesNotMatch(workflow, /vercel@latest/);
  }
});

test('API production deployment must pass health readiness and bootstrap smoke checks', () => {
  assert.match(apiWorkflow, /\/health/);
  assert.match(apiWorkflow, /\/ready/);
  assert.match(apiWorkflow, /\/v1\/bootstrap/);
  assert.match(apiWorkflow, /production API smoke PASS/);
});

test('Web production deployment checks the real login landing page before Admin deploy', () => {
  assert.match(frontendWorkflow, /https:\/\/web-unique-6ff0\.vercel\.app/);
  assert.match(frontendWorkflow, /ورود با ایمیل/);
  assert.match(frontendWorkflow, /production Web smoke PASS/);
});
