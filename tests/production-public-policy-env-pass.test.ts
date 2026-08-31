import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

for (const name of [
  'PRODUCTION_PRIVACY_POLICY_URL',
  'PRODUCTION_TERMS_OF_SERVICE_URL',
  'PRODUCTION_ACCOUNT_DELETION_URL',
]) {
  test(`production workflow may pass legacy-compatible ${name} only through the locked sync guard`, () => {
    const expected = name + ': ${{ secrets.' + name + ' }}';
    assert.ok(workflow.includes(expected), `missing workflow env pass-through for ${name}`);
    assert.match(envSync, new RegExp(`requireAbsentOrExact\\('${name}'`));
  });
}

test('technical-beta support identity is source-locked instead of accepting a secret-only override', () => {
  assert.doesNotMatch(workflow, /PRODUCTION_SUPPORT_EMAIL/);
  assert.doesNotMatch(envSync, /PRODUCTION_SUPPORT_EMAIL/);
  assert.match(envSync, /const DEFAULT_MAILBOX_EMAIL = 'sales@uniqueholding\.com\.tr'/);
  assert.match(envSync, /const supportEmail = DEFAULT_MAILBOX_EMAIL/);
});

test('infrastructure deploy keeps caller closed and requires a truly ready legal bootstrap', () => {
  assert.match(workflow, /body\?\.features\?\.callerClosedBetaEnabled === false/);
  assert.match(workflow, /body\?\.legal\?\.ready === true/);
  assert.doesNotMatch(workflow, /typeof body\?\.legal\?\.ready === 'boolean'/);
});
