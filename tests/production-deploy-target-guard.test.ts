import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const frontendWorkflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');
const migrationWorkflow = await readFile(new URL('../.github/workflows/migrate-production-db.yml', import.meta.url), 'utf8');
const qaWorkflow = await readFile(new URL('../.github/workflows/foundation-qa.yml', import.meta.url), 'utf8');
const lockWorkflow = await readFile(new URL('../.github/workflows/generate-dependency-lock.yml', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const emailSmoke = await readFile(new URL('../scripts/smoke-production-email-auth.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const apiVercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const webVercel = JSON.parse(await readFile(new URL('../apps/web/vercel.json', import.meta.url), 'utf8'));
const adminVercel = JSON.parse(await readFile(new URL('../apps/admin/vercel.json', import.meta.url), 'utf8'));

const teamId = 'team_GmseY3ibD05FWemVhLElL3hI';
const teamSlug = 'unique-6ff0';
const apiProject = 'prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy';
const webProject = 'prj_afhSiMYpsCfIAxuOmotLAWBvTMDg';
const adminProject = 'prj_l18v3f003ORfiN6hKxYwJbvVPzzC';
const checkoutAction = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const setupNodeAction = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
const defaultMailbox = 'sales@uniqueholding.com.tr';

function escaped(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

test('production mutation workflows are manual-only and require exact confirmation', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow, migrationWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /\n\s+push:\s*\n/);
    assert.match(workflow, /GITHUB_EVENT_NAME[^\n]*workflow_dispatch/);
    assert.match(workflow, /refs\/heads\/main/);
    assert.match(workflow, /morfisam25-tech\/YEKI-HAST/);
  }
  assert.match(apiWorkflow, /DEPLOY-PRODUCTION-API/);
  assert.match(frontendWorkflow, /DEPLOY-PRODUCTION-FRONTENDS/);
  assert.match(migrationWorkflow, /MIGRATE_YEKI_HAST_PRODUCTION/);
  assert.doesNotMatch(apiWorkflow, /\.launch\/production-api/);
  assert.doesNotMatch(frontendWorkflow, /\.launch\/production-frontends/);
});

test('production targets are pinned to UNIQUE and exact YEKI-HAST projects only', () => {
  assert.match(apiWorkflow, escaped(teamId));
  assert.match(apiWorkflow, escaped(teamSlug));
  assert.match(apiWorkflow, escaped(apiProject));
  assert.match(frontendWorkflow, escaped(teamId));
  assert.match(frontendWorkflow, escaped(teamSlug));
  assert.match(frontendWorkflow, escaped(webProject));
  assert.match(frontendWorkflow, escaped(adminProject));
  for (const workflow of [apiWorkflow, frontendWorkflow, migrationWorkflow]) {
    assert.doesNotMatch(workflow, /evidence[-_ ]?axis/i);
  }
});

test('automatic Vercel Git deploys stay disabled', () => {
  for (const config of [apiVercel, webVercel, adminVercel]) {
    assert.equal(config?.git?.deploymentEnabled, false);
  }
});

test('privileged workflows use immutable actions and the locked Node toolchain', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow, migrationWorkflow, qaWorkflow, lockWorkflow]) {
    assert.ok(workflow.includes(checkoutAction));
    assert.ok(workflow.includes(setupNodeAction));
    assert.match(workflow, /node-version: '22\.23\.1'/);
    assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);
  }
  for (const workflow of [apiWorkflow, frontendWorkflow, migrationWorkflow]) {
    assert.match(workflow, /package-manager-cache: false/);
  }
  assert.equal(packageJson.devDependencies?.vercel, '59.3.0');
  assert.equal(packageJson.devDependencies?.esbuild, '0.25.9');
});

test('production release installs only from the committed workspace lock', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow, migrationWorkflow]) {
    assert.match(workflow, /package-lock\.json is required before production/);
    assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
    assert.doesNotMatch(workflow, /npx --yes|vercel@latest/);
  }
  assert.match(apiWorkflow, /\$VERCEL_BIN/);
  assert.match(apiWorkflow, /\$ESBUILD_BIN/);
  assert.match(frontendWorkflow, /\$VERCEL_BIN/);
});

test('API deploy is fail-closed on irreducible credentials and approved DB target', () => {
  for (const name of ['VERCEL_TOKEN', 'PRODUCTION_DATABASE_URL', 'PRODUCTION_SMTP_PASSWORD']) {
    assert.match(apiWorkflow, escaped(name));
  }
  assert.match(apiWorkflow, /Require explicitly approved aws-us-east-1 database target/);
  assert.match(apiWorkflow, /\.us-east-1\.aws\.neon\.tech/);
  assert.match(apiWorkflow, /host_sha256/);
  assert.match(apiWorkflow, /Verify production database without migrations/);
  assert.match(apiWorkflow, /Require successful Foundation QA coverage for this source/);
  assert.match(apiWorkflow, /"regions": \["iad1"\]/);
});

test('production env sync keeps technical-beta gates closed and public identity exact', () => {
  assert.match(envSync, escaped(`const DEFAULT_MAILBOX_EMAIL = '${defaultMailbox}'`));
  assert.match(envSync, /const supportEmail = DEFAULT_MAILBOX_EMAIL/);
  assert.doesNotMatch(envSync, /PRODUCTION_SUPPORT_EMAIL/);
  assert.match(envSync, /CALLER_CLOSED_BETA_ENABLED', 'false'/);
  assert.match(envSync, /MANUAL_PHONE_VERIFICATION_BETA_ENABLED', 'false'/);
  assert.match(envSync, /BOOTSTRAP_ADMIN_ENABLED', 'false'/);
  assert.match(envSync, /DEV_EXPOSE_OTP', 'false'/);
  assert.match(envSync, /EMAIL_PROVIDER', 'smtp'/);
  assert.doesNotMatch(envSync, /console\.log\([^\n]*(DATABASE_URL|SMTP_PASSWORD|DATA_ENCRYPTION_KEYS|HASH_PEPPER)/);
});

test('API release requires exact live readiness and real Email OTP E2E', () => {
  assert.match(apiWorkflow, /body\?\.releaseSha === expectedSha/);
  assert.match(apiWorkflow, /body\?\.database === 'ready'/);
  assert.match(apiWorkflow, /body\?\.schema === 'ready'/);
  assert.match(apiWorkflow, /body\?\.features\?\.callerClosedBetaEnabled === false/);
  assert.match(apiWorkflow, /body\?\.legal\?\.ready === true/);
  assert.match(apiWorkflow, escaped(defaultMailbox));
  assert.match(apiWorkflow, /smoke-production-email-auth\.mjs/);
  assert.match(emailSmoke, /imap\.gmail\.com/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/request/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/verify/);
  assert.match(emailSmoke, /\/v1\/auth\/logout/);
  assert.match(emailSmoke, /revoked\.status !== 401/);
  assert.doesNotMatch(emailSmoke, /console\.log\([^\n]*(code|token|password)/i);
});

test('frontend release stays protected until exact smoke passes and only Web may open', () => {
  const preflight = frontendWorkflow.indexOf('Require Web and Admin to be protected before any frontend deployment');
  const webDeploy = frontendWorkflow.indexOf('Deploy prebuilt Web artifact to protected UNIQUE production');
  const adminDeploy = frontendWorkflow.indexOf('Deploy prebuilt Admin artifact to UNIQUE production');
  const adminProtection = frontendWorkflow.indexOf('Require Admin to remain protected from unauthenticated access');
  const adminSmoke = frontendWorkflow.indexOf('Verify exact protected Admin deployment shell with authenticated Vercel CLI');
  const webSmoke = frontendWorkflow.indexOf('Verify exact protected Web release before public cutover');
  const cutover = frontendWorkflow.indexOf('Make only verified Web release public');
  const publicSmoke = frontendWorkflow.indexOf('Verify Web canonical production alias public surfaces');

  assert.ok(preflight >= 0 && webDeploy > preflight && adminDeploy > webDeploy);
  assert.ok(adminProtection > adminDeploy && adminSmoke > adminProtection);
  assert.ok(webSmoke > adminSmoke && cutover > webSmoke && publicSmoke > cutover);
  assert.match(frontendWorkflow, /project protection disable "\$WEB_PROJECT_NAME"/);
  assert.doesNotMatch(frontendWorkflow, /project protection disable "\$ADMIN_PROJECT_NAME"/);
  assert.match(frontendWorkflow, /project protection enable "\$WEB_PROJECT_NAME"/);
  assert.match(frontendWorkflow, /mailto:sales@uniqueholding\.com\.tr/);
});
