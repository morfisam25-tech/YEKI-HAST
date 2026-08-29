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

const publicRuntimeKeys = [
  'PRIVACY_POLICY_URL',
  'TERMS_OF_SERVICE_URL',
  'ACCOUNT_DELETION_URL',
  'SUPPORT_EMAIL',
];

const publicSecretInputs = [
  'PRODUCTION_PRIVACY_POLICY_URL',
  'PRODUCTION_TERMS_OF_SERVICE_URL',
  'PRODUCTION_ACCOUNT_DELETION_URL',
  'PRODUCTION_SUPPORT_EMAIL',
];

const canonicalWebOrigin = 'https://web-unique-6ff0.vercel.app';

test('runtime public-release env remains explicit and has no placeholder sample values', () => {
  for (const key of publicRuntimeKeys) {
    assert.match(envExample, new RegExp(`^${key}=$`, 'm'));
  }
  assert.match(envExample, /Keep blank until real published HTTPS pages\/flows exist/);
});

test('shared public-release parser rejects non-public surfaces and only reports readiness when all exist', () => {
  assert.match(publicRelease, /url\.protocol !== 'https:'/);
  assert.match(publicRelease, /localhost/);
  assert.match(publicRelease, /url\.username \|\| url\.password/);
  assert.match(publicRelease, /privacyPolicyUrl: string \| null/);
  assert.match(publicRelease, /accountDeletionUrl: string \| null/);
  assert.match(publicRelease, /supportEmail: string \| null/);
  assert.match(publicRelease, /ready: Boolean\(privacyPolicyUrl && termsOfServiceUrl && accountDeletionUrl && support\)/);
});

test('caller readiness fails closed until every public release surface is valid', () => {
  assert.match(readiness, /getPublicReleaseConfig/);
  assert.match(readiness, /const publicRelease = getPublicReleaseConfig\(\)/);
  assert.match(readiness, /&& publicRelease\.ready;/);
  assert.match(readiness, /publicReleasePolicy:\s*\{/);
  assert.match(readiness, /privacyPolicyReady: Boolean\(publicRelease\.privacyPolicyUrl\)/);
  assert.match(readiness, /termsOfServiceReady: Boolean\(publicRelease\.termsOfServiceUrl\)/);
  assert.match(readiness, /accountDeletionReady: Boolean\(publicRelease\.accountDeletionUrl\)/);
  assert.match(readiness, /supportReady: Boolean\(publicRelease\.supportEmail\)/);
});

test('production security verifier requires real public surfaces when caller beta is enabled', () => {
  assert.match(securityVerifier, /const callerClosedBetaEnabled = optionalBoolean\('CALLER_CLOSED_BETA_ENABLED', false\)/);
  assert.match(securityVerifier, /if \(callerClosedBetaEnabled\)/);
  assert.match(securityVerifier, /publicHttpsUrl\('PRIVACY_POLICY_URL'\)/);
  assert.match(securityVerifier, /publicHttpsUrl\('TERMS_OF_SERVICE_URL'\)/);
  assert.match(securityVerifier, /publicHttpsUrl\('ACCOUNT_DELETION_URL'\)/);
  assert.match(securityVerifier, /emailAddress\('SUPPORT_EMAIL'\)/);
});

test('privacy terms and account deletion are first-party canonical Web surfaces', () => {
  assert.ok(envSync.includes(`const DEFAULT_PRIVACY_POLICY_URL = '${canonicalWebOrigin}/privacy'`));
  assert.ok(envSync.includes(`const DEFAULT_TERMS_OF_SERVICE_URL = '${canonicalWebOrigin}/terms'`));
  assert.ok(envSync.includes(`const DEFAULT_ACCOUNT_DELETION_URL = '${canonicalWebOrigin}/account/delete'`));
  assert.match(envSync, /provided\('PRODUCTION_PRIVACY_POLICY_URL'\) \?\? DEFAULT_PRIVACY_POLICY_URL/);
  assert.match(envSync, /provided\('PRODUCTION_TERMS_OF_SERVICE_URL'\) \?\? DEFAULT_TERMS_OF_SERVICE_URL/);
  assert.match(envSync, /provided\('PRODUCTION_ACCOUNT_DELETION_URL'\) \?\? DEFAULT_ACCOUNT_DELETION_URL/);
  assert.match(envSync, /setPlain\('PRIVACY_POLICY_URL', privacyPolicyUrl\)/);
  assert.match(envSync, /setPlain\('TERMS_OF_SERVICE_URL', termsOfServiceUrl\)/);
  assert.match(envSync, /setPlain\('ACCOUNT_DELETION_URL', accountDeletionUrl\)/);
  assert.match(privacyPage, /حریم خصوصی/);
  assert.match(privacyPage, /\/account\/delete/);
  assert.match(termsPage, /قوانین استفاده/);
  assert.match(termsPage, /\/account\/delete/);
  assert.match(webLanding, /href="\/privacy"/);
  assert.match(webLanding, /href="\/terms"/);
  assert.match(webLanding, /href="\/account\/delete"/);
});

test('production env sync keeps support explicit and never clears public values with blanks', () => {
  for (const key of publicSecretInputs) assert.ok(envSync.includes(key), `missing ${key}`);
  assert.match(envSync, /provided\('PRODUCTION_SUPPORT_EMAIL'\)/);
  assert.match(envSync, /if \(supportEmail\) setPlain\('SUPPORT_EMAIL', supportEmail\)/);
  assert.doesNotMatch(envSync, /setPlain\('PRIVACY_POLICY_URL',\s*''\)/);
  assert.doesNotMatch(envSync, /setPlain\('TERMS_OF_SERVICE_URL',\s*''\)/);
  assert.doesNotMatch(envSync, /setPlain\('ACCOUNT_DELETION_URL',\s*''\)/);
  assert.doesNotMatch(envSync, /setPlain\('SUPPORT_EMAIL',\s*''\)/);
});
