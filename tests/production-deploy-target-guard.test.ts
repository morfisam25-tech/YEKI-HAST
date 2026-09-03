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
  for (const name of ['VERCEL_TOKEN', 'PRODUCTION_DATABASE_URL', 'PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON']) {
    assert.match(apiWorkflow, escaped(name));
  }
  assert.doesNotMatch(apiWorkflow, /PRODUCTION_SMTP_PASSWORD/);
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
  assert.match(envSync, /EMAIL_PROVIDER', 'gmail_api'/);
  assert.match(envSync, /GMAIL_IMPERSONATED_USER/);
  assert.doesNotMatch(envSync, /console\.log\([^\n]*(DATABASE_URL|GMAIL_SERVICE_ACCOUNT_JSON|DATA_ENCRYPTION_KEYS|HASH_PEPPER)/);
});

test('API release makes only YEKI-HAST API public before exact live readiness and Email OTP E2E', () => {
  const deploy = apiWorkflow.indexOf('Deploy prebuilt API artifact to UNIQUE production');
  const publicCutover = apiWorkflow.indexOf('Make production API publicly reachable');
  const liveSmoke = apiWorkflow.indexOf('Verify production health readiness and bootstrap');
  const emailE2e = apiWorkflow.indexOf('Verify production Email OTP delivery session and logout E2E');

  assert.ok(deploy >= 0 && publicCutover > deploy && liveSmoke > publicCutover && emailE2e > liveSmoke);
  assert.match(apiWorkflow, /API_PROJECT_NAME: yeki-hast/);
  assert.match(apiWorkflow, /project protection disable "\$API_PROJECT_NAME"/);
  assert.match(apiWorkflow, /body\?\.releaseSha === expectedSha/);
  assert.match(apiWorkflow, /body\?\.database === 'ready'/);
  assert.match(apiWorkflow, /body\?\.schema === 'ready'/);
  assert.match(apiWorkflow, /body\?\.features\?\.callerClosedBetaEnabled === false/);
  assert.match(apiWorkflow, /body\?\.legal\?\.ready === true/);
  assert.match(apiWorkflow, escaped(defaultMailbox));
  assert.match(apiWorkflow, /smoke-production-email-auth\.mjs/);
  assert.match(emailSmoke, /gmail\.googleapis\.com\/gmail\/v1\/users\/me/);
  assert.match(emailSmoke, /gmail\.readonly/);
  assert.match(emailSmoke, /labelIds=INBOX/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/request/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/verify/);
  assert.match(emailSmoke, /\/v1\/auth\/logout/);
  assert.match(emailSmoke, /revoked\.status !== 401/);
  assert.doesNotMatch(emailSmoke, /console\.log\([^\n]*(code|token|password|private_key)/i);
});

test('frontend release stages protected production artifacts, verifies exact deployments, then promotes safely', () => {
  const preflight = frontendWorkflow.indexOf('Configure staged Web protection and require Admin fail-closed before any frontend deployment');
  const webDeploy = frontendWorkflow.indexOf('Deploy prebuilt Web artifact as protected staged production');
  const adminDeploy = frontendWorkflow.indexOf('Deploy prebuilt Admin artifact as protected staged production');
  const stagedProtection = frontendWorkflow.indexOf('Require staged Web and Admin deployment URLs protected from unauthenticated access');
  const adminSmoke = frontendWorkflow.indexOf('Verify exact protected Admin deployment shell with authenticated Vercel CLI');
  const webSmoke = frontendWorkflow.indexOf('Verify exact protected Web release before public cutover');
  const adminPromote = frontendWorkflow.indexOf('Promote verified Admin release while keeping canonical protected');
  const adminProtection = frontendWorkflow.indexOf('Require promoted Admin canonical to remain protected from unauthenticated access');
  const webPromote = frontendWorkflow.indexOf('Promote only verified Web release to public production');
  const publicSmoke = frontendWorkflow.indexOf('Verify Web canonical production alias public surfaces');
  const rollback = frontendWorkflow.indexOf('Roll back Web if post-promotion public verification fails');

  assert.ok(preflight >= 0 && webDeploy > preflight && adminDeploy > webDeploy);
  assert.ok(stagedProtection > adminDeploy && adminSmoke > stagedProtection && webSmoke > adminSmoke);
  assert.ok(adminPromote > webSmoke && adminProtection > adminPromote && webPromote > adminProtection);
  assert.ok(publicSmoke > webPromote && rollback > publicSmoke);
  assert.match(frontendWorkflow, /api\.vercel\.com\/v9\/projects/);
  assert.match(frontendWorkflow, /deploymentType: 'prod_deployment_urls_and_all_previews'/);
  assert.match(frontendWorkflow, /--prod \\\n\s+--skip-domain/);
  assert.match(frontendWorkflow, /"\$VERCEL_BIN" promote "\$ADMIN_EXACT_DEPLOYMENT_URL"/);
  assert.match(frontendWorkflow, /"\$VERCEL_BIN" promote "\$WEB_EXACT_DEPLOYMENT_URL"/);
  assert.match(frontendWorkflow, /"\$VERCEL_BIN" rollback/);
  assert.doesNotMatch(frontendWorkflow, /deploymentType: 'all'/);
  assert.doesNotMatch(frontendWorkflow, /JSON\.stringify\(\{ ssoProtection: null \}\)/);
  assert.doesNotMatch(frontendWorkflow, /project protection disable "\$ADMIN_PROJECT_NAME"/);
  assert.match(frontendWorkflow, /mailto:sales@uniqueholding\.com\.tr/);
});
