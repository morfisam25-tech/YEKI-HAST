import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const frontendWorkflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const emailSmoke = await readFile(new URL('../scripts/smoke-production-email-auth.mjs', import.meta.url), 'utf8');
const apiVercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const webVercel = JSON.parse(await readFile(new URL('../apps/web/vercel.json', import.meta.url), 'utf8'));
const adminVercel = JSON.parse(await readFile(new URL('../apps/admin/vercel.json', import.meta.url), 'utf8'));

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

test('automatic Vercel Git deploys stay disabled so production changes use the controlled Actions path', () => {
  for (const config of [apiVercel, webVercel, adminVercel]) {
    assert.equal(config?.git?.deploymentEnabled, false);
  }
});

test('production workflows refuse non-main refs and use a pinned Vercel CLI version', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow]) {
    assert.match(workflow, /refs\/heads\/main/);
    assert.match(workflow, /morfisam25-tech\/YEKI-HAST/);
    assert.match(workflow, /vercel@59\.3\.0/);
    assert.doesNotMatch(workflow, /vercel@latest/);
  }
});

test('production deploys can be triggered later by narrow main-branch marker commits', () => {
  assert.match(apiWorkflow, /\.launch\/production-api/);
  assert.match(frontendWorkflow, /\.launch\/production-frontends/);
  assert.match(apiWorkflow, /branches: \[main\]/);
  assert.match(frontendWorkflow, /branches: \[main\]/);
});

test('API production deployment requires only the irreducible external launch secrets and reports every missing name before mutation', () => {
  for (const name of [
    'VERCEL_TOKEN',
    'PRODUCTION_DATABASE_URL',
    'PRODUCTION_SMTP_USERNAME',
    'PRODUCTION_SMTP_PASSWORD',
  ]) {
    assert.match(apiWorkflow, escaped(name));
  }
  assert.match(apiWorkflow, /missing=\(\)/);
  assert.match(apiWorkflow, /missing\+=\("\$name"\)/);
  assert.match(apiWorkflow, /Missing required repository secret\(s\)/);
  const credentialGuard = apiWorkflow.indexOf('missing=()');
  const dbPreflight = apiWorkflow.indexOf('Verify production database without migrations');
  const envSyncStep = apiWorkflow.indexOf('Sync exact API production environment to UNIQUE');
  assert.ok(credentialGuard >= 0 && dbPreflight > credentialGuard && envSyncStep > credentialGuard);
  assert.match(apiWorkflow, /Verify production database without migrations/);
  assert.match(apiWorkflow, /sync-vercel-production-env\.mjs/);
});

test('production environment sync defaults to Google Workspace submission while allowing overrides', () => {
  assert.match(envSync, /optional\('PRODUCTION_SMTP_HOST', 'smtp\.gmail\.com'\)/);
  assert.match(envSync, /optional\('PRODUCTION_SMTP_PORT', '465'\)/);
  assert.match(envSync, /optional\('PRODUCTION_SMTP_SECURE', 'true'\)/);
  assert.match(envSync, /optional\('PRODUCTION_SMTP_FROM_EMAIL', smtpUsername\)/);
});

test('production environment sync is pinned to the API project and preserves closed launch gates', () => {
  assert.match(envSync, escaped(teamId));
  assert.match(envSync, escaped(apiProject));
  assert.match(envSync, /type: 'sensitive'/);
  assert.match(envSync, /CALLER_CLOSED_BETA_ENABLED', 'false'/);
  assert.match(envSync, /MANUAL_PHONE_VERIFICATION_BETA_ENABLED', 'false'/);
  assert.match(envSync, /BOOTSTRAP_ADMIN_ENABLED', 'false'/);
  assert.match(envSync, /DEV_EXPOSE_OTP', 'false'/);
  assert.match(envSync, /EMAIL_PROVIDER', 'smtp'/);
  assert.match(envSync, /partial; refusing to rotate or guess it/);
  assert.doesNotMatch(envSync, /console\.log\([^\n]*(DATABASE_URL|SMTP_PASSWORD|DATA_ENCRYPTION_KEYS|HASH_PEPPER)/);
});

test('API production deployment must pass health readiness and bootstrap smoke checks', () => {
  assert.match(apiWorkflow, /\/health/);
  assert.match(apiWorkflow, /\/ready/);
  assert.match(apiWorkflow, /\/v1\/bootstrap/);
  assert.match(apiWorkflow, /production API smoke PASS/);
});

test('API production deployment must complete real Email OTP delivery verify session and logout', () => {
  assert.match(apiWorkflow, /smoke-production-email-auth\.mjs/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/request/);
  assert.match(emailSmoke, /imap\.gmail\.com/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/verify/);
  assert.match(emailSmoke, /\/v1\/auth\/session/);
  assert.match(emailSmoke, /\/v1\/auth\/logout/);
  assert.match(emailSmoke, /revoked\.status !== 401/);
  assert.match(emailSmoke, /secrets hidden/);
  assert.doesNotMatch(emailSmoke, /console\.log\([^\n]*(code|token|password)/i);
});

test('Web stays publicly smoke-tested while protected Admin uses authenticated Vercel CLI access', () => {
  assert.match(frontendWorkflow, /https:\/\/web-unique-6ff0\.vercel\.app/);
  assert.match(frontendWorkflow, /ورود با ایمیل/);
  assert.match(frontendWorkflow, /production Web public smoke PASS/);
  assert.match(frontendWorkflow, /redirect: 'manual'/);

  assert.match(frontendWorkflow, /https:\/\/admin-unique-6ff0\.vercel\.app/);
  assert.match(frontendWorkflow, /vercel@59\.3\.0 curl \/ /);
  assert.match(frontendWorkflow, /--deployment "\$ADMIN_PRODUCTION_URL"/);
  assert.match(frontendWorkflow, /--token "\$VERCEL_TOKEN"/);
  assert.match(frontendWorkflow, /یکی هست \/ عملیات/);
  assert.match(frontendWorkflow, /production protected Admin smoke PASS/);

  const adminDeploy = frontendWorkflow.indexOf('Deploy Admin to UNIQUE production');
  const adminSmoke = frontendWorkflow.indexOf('Verify protected Admin production shell with authenticated Vercel CLI');
  assert.ok(adminDeploy >= 0 && adminSmoke > adminDeploy);
});
