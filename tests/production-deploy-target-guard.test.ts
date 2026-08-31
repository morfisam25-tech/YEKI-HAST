import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const frontendWorkflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');
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
const releaseNode = '22.23.1';
const lockedInstall = 'npm ci --ignore-scripts --no-audit --no-fund';
const checkoutAction = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const setupNodeAction = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
const uploadArtifactAction = 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const defaultMailbox = 'sales@uniqueholding.com.tr';

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

test('production workflows refuse non-main refs and release tooling versions live in the workspace lock manifest', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow]) {
    assert.match(workflow, /refs\/heads\/main/);
    assert.match(workflow, /morfisam25-tech\/YEKI-HAST/);
    assert.doesNotMatch(workflow, /vercel@latest/);
    assert.doesNotMatch(workflow, /npx --yes vercel@/);
  }
  assert.equal(packageJson.devDependencies?.vercel, '59.3.0');
  assert.equal(packageJson.devDependencies?.esbuild, '0.25.9');
});

test('GitHub JavaScript actions are immutable current-generation pins', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow, qaWorkflow, lockWorkflow]) {
    assert.ok(workflow.includes(checkoutAction), 'missing immutable checkout v7.0.1 pin');
    assert.ok(workflow.includes(setupNodeAction), 'missing immutable setup-node v7.0.0 pin');
    assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node|upload-artifact)@v4/);
  }
  assert.ok(qaWorkflow.includes(uploadArtifactAction));
  assert.ok(lockWorkflow.includes(uploadArtifactAction));
});

test('production workflows checkout source and require the validated dependency lock before deploy', () => {
  for (const workflow of [apiWorkflow, frontendWorkflow]) {
    assert.ok(workflow.includes(checkoutAction));
    assert.match(workflow, /package-lock\.json is required before production/);
    assert.match(workflow, /node-version: '22\.23\.1'/);
    assert.match(workflow, escaped(lockedInstall));
    assert.doesNotMatch(workflow, /npm install --ignore-scripts --no-audit --no-fund/);
  }
  assert.match(frontendWorkflow, /Checkout exact source/);
  assert.match(apiWorkflow, escaped(releaseNode));
  assert.match(frontendWorkflow, escaped(releaseNode));
});

test('dependency lock generation hands the validated main branch to an explicit QA dispatch', () => {
  assert.match(lockWorkflow, /workflow_dispatch:/);
  assert.match(lockWorkflow, /contents: write/);
  assert.match(lockWorkflow, /actions: write/);
  assert.ok(lockWorkflow.includes(checkoutAction));
  assert.ok(lockWorkflow.includes(setupNodeAction));
  assert.match(lockWorkflow, /package-manager-cache: false/);
  assert.match(lockWorkflow, /node-version: '22\.23\.1'/);
  assert.match(lockWorkflow, /npm install --package-lock-only --ignore-scripts --no-audit --no-fund/);
  assert.match(lockWorkflow, escaped(lockedInstall));
  assert.match(lockWorkflow, /git push origin HEAD:main/);
  assert.match(lockWorkflow, /gh workflow run foundation-qa\.yml --ref main/);
  assert.match(qaWorkflow, /workflow_dispatch:/);
  assert.match(qaWorkflow, /package-lock\.json is required before Foundation QA/);
  assert.match(qaWorkflow, /node-version: '22\.23\.1'/);
  assert.match(qaWorkflow, escaped(lockedInstall));
});

test('production deploys use only lock-installed Vercel and esbuild binaries', () => {
  assert.match(apiWorkflow, /VERCEL_BIN: \$\{\{ github\.workspace \}\}\/node_modules\/\.bin\/vercel/);
  assert.match(apiWorkflow, /ESBUILD_BIN: \$\{\{ github\.workspace \}\}\/node_modules\/\.bin\/esbuild/);
  assert.match(frontendWorkflow, /VERCEL_BIN: \$\{\{ github\.workspace \}\}\/node_modules\/\.bin\/vercel/);
  assert.match(apiWorkflow, /test -x "\$VERCEL_BIN"/);
  assert.match(apiWorkflow, /test -x "\$ESBUILD_BIN"/);
  assert.match(frontendWorkflow, /test -x "\$VERCEL_BIN"/);
  assert.match(apiWorkflow, /"\$ESBUILD_BIN" api\/index\.ts/);
  for (const workflow of [apiWorkflow, frontendWorkflow]) {
    assert.doesNotMatch(workflow, /npx --yes/);
    assert.doesNotMatch(workflow, /npx --no-install/);
  }
});

test('production deploys build in CI from the lock and upload only prebuilt Vercel output', () => {
  assert.equal(webVercel.installCommand, `cd ../.. && ${lockedInstall}`);
  assert.equal(adminVercel.installCommand, `cd ../.. && ${lockedInstall}`);

  for (const workflow of [apiWorkflow, frontendWorkflow]) {
    assert.ok(workflow.includes('"$VERCEL_BIN" pull'));
    assert.match(workflow, /--environment=production/);
    assert.ok(workflow.includes('"$VERCEL_BIN" build'));
    assert.ok(workflow.includes('"$VERCEL_BIN" deploy'));
    assert.match(workflow, /--prebuilt/);
    assert.match(workflow, /test -f \.vercel\/output\/config\.json/);
  }
  assert.match(apiWorkflow, /"installCommand": "cd \.\. && npm ci --ignore-scripts --no-audit --no-fund"/);
  assert.match(frontendWorkflow, /Build Web production artifact from locked workspace/);
  assert.match(frontendWorkflow, /Build Admin production artifact from locked workspace/);
  assert.match(apiWorkflow, /Bundle production API runtime/);
});

test('production deploys can be triggered later by narrow main-branch marker commits', () => {
  assert.match(apiWorkflow, /\.launch\/production-api/);
  assert.match(frontendWorkflow, /\.launch\/production-frontends/);
  assert.match(apiWorkflow, /branches: \[main\]/);
  assert.match(frontendWorkflow, /branches: \[main\]/);
});

test('API production deployment requires only irreducible external launch secrets and reports every missing name before mutation', () => {
  for (const name of [
    'VERCEL_TOKEN',
    'PRODUCTION_DATABASE_URL',
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

test('production environment sync locks beta mailbox and legal routes against stale optional overrides', () => {
  assert.match(envSync, escaped(`const DEFAULT_MAILBOX_EMAIL = '${defaultMailbox}'`));
  assert.match(envSync, /optional\('PRODUCTION_SMTP_HOST', 'smtp\.gmail\.com'\)/);
  assert.match(envSync, /optional\('PRODUCTION_SMTP_PORT', '465'\)/);
  assert.match(envSync, /optional\('PRODUCTION_SMTP_SECURE', 'true'\)/);
  assert.match(envSync, /requireAbsentOrExact\('PRODUCTION_SMTP_USERNAME', DEFAULT_MAILBOX_EMAIL/);
  assert.match(envSync, /requireAbsentOrExact\('PRODUCTION_SMTP_FROM_EMAIL', DEFAULT_MAILBOX_EMAIL/);
  assert.match(envSync, /const smtpUsername = DEFAULT_MAILBOX_EMAIL;/);
  assert.match(envSync, /const smtpFromEmail = DEFAULT_MAILBOX_EMAIL;/);
  assert.match(envSync, /requireAbsentOrExact\('PRODUCTION_PRIVACY_POLICY_URL', DEFAULT_PRIVACY_POLICY_URL\)/);
  assert.match(envSync, /requireAbsentOrExact\('PRODUCTION_TERMS_OF_SERVICE_URL', DEFAULT_TERMS_OF_SERVICE_URL\)/);
  assert.match(envSync, /requireAbsentOrExact\('PRODUCTION_ACCOUNT_DELETION_URL', DEFAULT_ACCOUNT_DELETION_URL\)/);
  assert.match(envSync, /const privacyPolicyUrl = DEFAULT_PRIVACY_POLICY_URL;/);
  assert.match(envSync, /const termsOfServiceUrl = DEFAULT_TERMS_OF_SERVICE_URL;/);
  assert.match(envSync, /const accountDeletionUrl = DEFAULT_ACCOUNT_DELETION_URL;/);
  assert.match(envSync, /const supportEmail = DEFAULT_MAILBOX_EMAIL;/);
  assert.doesNotMatch(envSync, /PRODUCTION_SUPPORT_EMAIL/);
  assert.match(envSync, /conflicts with the locked technical-beta configuration/);
  assert.match(envSync, /setPlain\('SUPPORT_EMAIL', supportEmail\)/);
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

test('API production deployment must require ready legal bootstrap and exact public support identity', () => {
  assert.match(apiWorkflow, /\/health/);
  assert.match(apiWorkflow, /\/ready/);
  assert.match(apiWorkflow, /\/v1\/bootstrap/);
  assert.match(apiWorkflow, /body\?\.legal\?\.ready === true/);
  assert.match(apiWorkflow, escaped(defaultMailbox));
  assert.match(apiWorkflow, /body\?\.legal\?\.supportEmail === expectedLegal\.supportEmail/);
  assert.match(apiWorkflow, /production API smoke PASS/);
});

test('API production deployment must complete real Email OTP delivery verify session and logout', () => {
  assert.match(apiWorkflow, /smoke-production-email-auth\.mjs/);
  assert.match(emailSmoke, escaped(`const DEFAULT_MAILBOX_EMAIL = '${defaultMailbox}'`));
  assert.match(emailSmoke, /optional\('PRODUCTION_SMTP_USERNAME', DEFAULT_MAILBOX_EMAIL\)/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/request/);
  assert.match(emailSmoke, /imap\.gmail\.com/);
  assert.match(emailSmoke, /\/v1\/auth\/email\/verify/);
  assert.match(emailSmoke, /\/v1\/auth\/session/);
  assert.match(emailSmoke, /\/v1\/auth\/logout/);
  assert.match(emailSmoke, /revoked\.status !== 401/);
  assert.match(emailSmoke, /secrets hidden/);
  assert.doesNotMatch(emailSmoke, /console\.log\([^\n]*(code|token|password)/i);
});

test('Web is made public in controlled release while Admin must remain protected', () => {
  assert.match(frontendWorkflow, /WEB_PROJECT_NAME: web/);
  assert.ok(frontendWorkflow.includes('"$VERCEL_BIN" project protection disable "$WEB_PROJECT_NAME"'));
  assert.match(frontendWorkflow, /--sso/);
  assert.doesNotMatch(frontendWorkflow, /project protection disable "\$ADMIN_PROJECT_NAME"/);

  assert.match(frontendWorkflow, /https:\/\/web-unique-6ff0\.vercel\.app/);
  assert.match(frontendWorkflow, /ورود با ایمیل/);
  assert.match(frontendWorkflow, /mailto:sales@uniqueholding\.com\.tr/);
  assert.match(frontendWorkflow, /\/privacy/);
  assert.match(frontendWorkflow, /\/terms/);
  assert.match(frontendWorkflow, /\/account\/delete/);
  assert.match(frontendWorkflow, /production Web public smoke PASS/);
  assert.match(frontendWorkflow, /redirect: 'manual'/);

  assert.match(frontendWorkflow, /https:\/\/admin-unique-6ff0\.vercel\.app/);
  assert.match(frontendWorkflow, /Require Admin to remain protected from unauthenticated access/);
  assert.match(frontendWorkflow, /response\.status >= 300 && response\.status < 400/);
  assert.match(frontendWorkflow, /response\.status === 401 \|\| response\.status === 403/);
  assert.ok(frontendWorkflow.includes('"$VERCEL_BIN" curl /'));
  assert.match(frontendWorkflow, /یکی هست \/ عملیات/);
  assert.match(frontendWorkflow, /production exact protected Admin smoke PASS/);

  const adminDeploy = frontendWorkflow.indexOf('Deploy prebuilt Admin artifact to UNIQUE production');
  const adminProtection = frontendWorkflow.indexOf('Require Admin to remain protected from unauthenticated access');
  const adminSmoke = frontendWorkflow.indexOf('Verify exact protected Admin deployment shell with authenticated Vercel CLI');
  assert.ok(adminDeploy >= 0 && adminProtection > adminDeploy && adminSmoke > adminProtection);
});
