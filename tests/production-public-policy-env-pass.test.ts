import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');

for (const name of [
  'PRODUCTION_PRIVACY_POLICY_URL',
  'PRODUCTION_TERMS_OF_SERVICE_URL',
  'PRODUCTION_ACCOUNT_DELETION_URL',
  'PRODUCTION_SUPPORT_EMAIL',
]) {
  test(`production workflow passes optional ${name}`, () => {
    const expected = name + ': ${{ secrets.' + name + ' }}';
    assert.ok(workflow.includes(expected), `missing workflow env pass-through for ${name}`);
  });
}

test('infrastructure deploy keeps caller closed while still validating the legal bootstrap shape', () => {
  assert.match(workflow, /body\?\.features\?\.callerClosedBetaEnabled === false/);
  assert.match(workflow, /typeof body\?\.legal\?\.ready === 'boolean'/);
});
