import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

const canonicalLegal = [
  ['PRIVACY_POLICY_URL', 'https://yekihast.app/privacy'],
  ['TERMS_OF_SERVICE_URL', 'https://yekihast.app/terms'],
  ['ACCOUNT_DELETION_URL', 'https://yekihast.app/account/delete'],
] as const;

for (const [runtimeName, url] of canonicalLegal) {
  test(`production legal surface ${runtimeName} is source-locked to the canonical domain`, () => {
    assert.match(envSync, new RegExp(`const DEFAULT_${runtimeName} = '${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    assert.match(envSync, new RegExp(`setPlain\\('${runtimeName}',`));
    assert.ok(workflow.includes(url), `production smoke must verify canonical ${runtimeName}`);
  });
}

for (const legacyName of [
  'PRODUCTION_PRIVACY_POLICY_URL',
  'PRODUCTION_TERMS_OF_SERVICE_URL',
  'PRODUCTION_ACCOUNT_DELETION_URL',
]) {
  test(`production release ignores stale legacy ${legacyName} overrides`, () => {
    assert.doesNotMatch(workflow, new RegExp(legacyName));
    assert.doesNotMatch(envSync, new RegExp(legacyName));
  });
}

test('technical-beta support identity is source-locked instead of accepting a secret-only override', () => {
  assert.doesNotMatch(workflow, /PRODUCTION_SUPPORT_EMAIL/);
  assert.doesNotMatch(envSync, /PRODUCTION_SUPPORT_EMAIL/);
  assert.match(envSync, /const DEFAULT_MAILBOX_EMAIL = 'sales@uniqueholding\.com\.tr'/);
  assert.match(envSync, /const supportEmail = DEFAULT_MAILBOX_EMAIL/);
});

test('production child-safety URL is source-locked to the canonical public route', () => {
  assert.match(envSync, /const DEFAULT_CHILD_SAFETY_URL = 'https:\/\/yekihast\.app\/safety\/children'/);
  assert.match(envSync, /setPlain\('CHILD_SAFETY_URL', childSafetyUrl\)/);
});

test('infrastructure deploy keeps caller closed and requires a truly ready legal bootstrap', () => {
  assert.match(workflow, /body\?\.features\?\.callerClosedBetaEnabled === false/);
  assert.match(workflow, /body\?\.legal\?\.ready === true/);
  assert.doesNotMatch(workflow, /typeof body\?\.legal\?\.ready === 'boolean'/);
});
