import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const publicRelease = await readFile(new URL('../services/api/src/lib/public-release.ts', import.meta.url), 'utf8');
const readiness = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');
const securityVerifier = await readFile(new URL('../scripts/verify-production-security-config.mjs', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

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

test('public release surfaces are explicit and have no placeholder defaults', () => {
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

test('production env sync accepts policy inputs without inventing or clearing them', () => {
  for (const key of publicSecretInputs) assert.ok(envSync.includes(key), `missing ${key}`);
  assert.match(envSync, /if \(privacyPolicyUrl\) setPlain\('PRIVACY_POLICY_URL', privacyPolicyUrl\)/);
  assert.match(envSync, /if \(termsOfServiceUrl\) setPlain\('TERMS_OF_SERVICE_URL', termsOfServiceUrl\)/);
  assert.match(envSync, /if \(accountDeletionUrl\) setPlain\('ACCOUNT_DELETION_URL', accountDeletionUrl\)/);
  assert.match(envSync, /if \(supportEmail\) setPlain\('SUPPORT_EMAIL', supportEmail\)/);
  assert.doesNotMatch(envSync, /setPlain\('PRIVACY_POLICY_URL',\s*''\)/);
  assert.doesNotMatch(envSync, /setPlain\('TERMS_OF_SERVICE_URL',\s*''\)/);
  assert.doesNotMatch(envSync, /setPlain\('ACCOUNT_DELETION_URL',\s*''\)/);
  assert.doesNotMatch(envSync, /setPlain\('SUPPORT_EMAIL',\s*''\)/);
});
