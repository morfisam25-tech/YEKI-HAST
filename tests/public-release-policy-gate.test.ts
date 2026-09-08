import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const publicRelease = await readFile(new URL('../services/api/src/lib/public-release.ts', import.meta.url), 'utf8');
const readiness = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');
const securityVerifier = await readFile(new URL('../scripts/verify-production-security-config.mjs', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const privacyPage = await readFile(new URL('../apps/web/app/privacy/page.tsx', import.meta.url), 'utf8');
const termsPage = await readFile(new URL('../apps/web/app/terms/page.tsx', import.meta.url), 'utf8');
const webLanding = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');

const publicRuntimeKeys = ['PRIVACY_POLICY_URL','TERMS_OF_SERVICE_URL','ACCOUNT_DELETION_URL','SUPPORT_EMAIL'];
const legacyPolicyInputs = ['PRODUCTION_PRIVACY_POLICY_URL','PRODUCTION_TERMS_OF_SERVICE_URL','PRODUCTION_ACCOUNT_DELETION_URL'];
const canonicalWebOrigin = 'https://yekihast.app';
const betaMailbox = 'sales@uniqueholding.com.tr';

test('runtime public-release env stays explicit for local/other environments while controlled production is source-locked', () => {
  for (const key of publicRuntimeKeys) assert.match(envExample, new RegExp(`^${key}=$`, 'm'));
  assert.match(envExample, /Controlled production env sync locks Privacy, Terms and Account Deletion/);
  assert.match(envExample, /support to the selected Workspace mailbox/);
  assert.match(envExample, /Real mailbox delivery\/readback must still pass the production Gmail API E2E gate/);
});

test('shared public-release parser rejects non-public surfaces and reports readiness only when all exist', () => {
  assert.match(publicRelease, /url\.protocol !== 'https:'/); assert.match(publicRelease, /localhost/);
  assert.match(publicRelease, /url\.username \|\| url\.password/); assert.match(publicRelease, /privacyPolicyUrl: string \| null/);
  assert.match(publicRelease, /accountDeletionUrl: string \| null/); assert.match(publicRelease, /supportEmail: string \| null/);
  assert.match(publicRelease, /ready: Boolean\(privacyPolicyUrl && termsOfServiceUrl && accountDeletionUrl && support\)/);
});

test('caller readiness fails closed until every public release surface is valid', () => {
  assert.match(readiness, /getPublicReleaseConfig/); assert.match(readiness, /const publicRelease = getPublicReleaseConfig\(\)/);
  assert.match(readiness, /&& publicRelease\.ready;/); assert.match(readiness, /publicReleasePolicy:\s*\{/);
  assert.match(readiness, /privacyPolicyReady: Boolean\(publicRelease\.privacyPolicyUrl\)/);
  assert.match(readiness, /termsOfServiceReady: Boolean\(publicRelease\.termsOfServiceUrl\)/);
  assert.match(readiness, /accountDeletionReady: Boolean\(publicRelease\.accountDeletionUrl\)/);
  assert.match(readiness, /supportReady: Boolean\(publicRelease\.supportEmail\)/);
});

test('production security verifier requires real public surfaces when caller beta is enabled', () => {
  assert.match(securityVerifier, /const callerClosedBetaEnabled = optionalBoolean\('CALLER_CLOSED_BETA_ENABLED', false\)/);
  assert.match(securityVerifier, /if \(callerClosedBetaEnabled\)/); assert.match(securityVerifier, /publicHttpsUrl\('PRIVACY_POLICY_URL'\)/);
  assert.match(securityVerifier, /publicHttpsUrl\('TERMS_OF_SERVICE_URL'\)/); assert.match(securityVerifier, /publicHttpsUrl\('ACCOUNT_DELETION_URL'\)/);
  assert.match(securityVerifier, /emailAddress\('SUPPORT_EMAIL'\)/);
});

test('privacy terms and account deletion are source-locked first-party canonical Web surfaces', () => {
  assert.ok(envSync.includes(`const DEFAULT_PRIVACY_POLICY_URL = '${canonicalWebOrigin}/privacy'`));
  assert.ok(envSync.includes(`const DEFAULT_TERMS_OF_SERVICE_URL = '${canonicalWebOrigin}/terms'`));
  assert.ok(envSync.includes(`const DEFAULT_ACCOUNT_DELETION_URL = '${canonicalWebOrigin}/account/delete'`));
  for (const name of legacyPolicyInputs) assert.doesNotMatch(envSync, new RegExp(name));
  assert.match(envSync, /const privacyPolicyUrl = DEFAULT_PRIVACY_POLICY_URL/); assert.match(envSync, /const termsOfServiceUrl = DEFAULT_TERMS_OF_SERVICE_URL/);
  assert.match(envSync, /const accountDeletionUrl = DEFAULT_ACCOUNT_DELETION_URL/); assert.match(envSync, /setPlain\('PRIVACY_POLICY_URL', privacyPolicyUrl\)/);
  assert.match(envSync, /setPlain\('TERMS_OF_SERVICE_URL', termsOfServiceUrl\)/); assert.match(envSync, /setPlain\('ACCOUNT_DELETION_URL', accountDeletionUrl\)/);
  assert.match(privacyPage, /حریم خصوصی/); assert.match(privacyPage, /\/account\/delete/); assert.match(termsPage, /قوانین استفاده/); assert.match(termsPage, /\/account\/delete/);
  assert.match(webLanding, /href="https:\/\/yekihast\.app\/privacy"/);
  assert.match(webLanding, /href="https:\/\/yekihast\.app\/terms"/);
  assert.match(webLanding, /href="https:\/\/yekihast\.app\/account\/delete"/);
});

test('technical-beta support identity is source-locked and cannot be redirected by a repository secret', () => {
  assert.ok(envSync.includes(`const DEFAULT_MAILBOX_EMAIL = '${betaMailbox}'`)); assert.match(envSync, /const supportEmail = DEFAULT_MAILBOX_EMAIL/);
  assert.match(envSync, /setPlain\('SUPPORT_EMAIL', supportEmail\)/); assert.doesNotMatch(envSync, /PRODUCTION_SUPPORT_EMAIL/);
  assert.match(webLanding, /mailto:sales@uniqueholding\.com\.tr/); assert.match(privacyPage, /mailto:sales@uniqueholding\.com\.tr/); assert.match(termsPage, /mailto:sales@uniqueholding\.com\.tr/);
});

test('production env sync never clears public values with blank writes', () => {
  assert.doesNotMatch(envSync, /setPlain\('PRIVACY_POLICY_URL',\s*''\)/); assert.doesNotMatch(envSync, /setPlain\('TERMS_OF_SERVICE_URL',\s*''\)/);
  assert.doesNotMatch(envSync, /setPlain\('ACCOUNT_DELETION_URL',\s*''\)/); assert.doesNotMatch(envSync, /setPlain\('SUPPORT_EMAIL',\s*''\)/);
});

test('selected support mailbox is reachable from all checked-in public policy surfaces', () => {
  assert.match(webLanding, new RegExp(betaMailbox.replace('.', '\\.'))); assert.match(privacyPage, new RegExp(betaMailbox.replace('.', '\\.'))); assert.match(termsPage, new RegExp(betaMailbox.replace('.', '\\.')));
});

test('mailbox usability is not treated as proven by source alone and production release carries a real mailbox E2E', async () => {
  const deployWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
  assert.match(deployWorkflow, /Verify production Email OTP delivery session and logout E2E/); assert.match(deployWorkflow, /smoke-production-email-auth\.mjs/);
});
