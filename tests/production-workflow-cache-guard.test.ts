import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const frontendWorkflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');
const migrationWorkflow = await readFile(new URL('../.github/workflows/migrate-production-db.yml', import.meta.url), 'utf8');
const qaWorkflow = await readFile(new URL('../.github/workflows/foundation-qa.yml', import.meta.url), 'utf8');

for (const [name, workflow] of [
  ['api', apiWorkflow],
  ['frontends', frontendWorkflow],
  ['migration', migrationWorkflow],
] as const) {
  test(`${name} privileged production workflow disables setup-node package-manager caching`, () => {
    assert.match(workflow, /package-manager-cache: false/);
    assert.doesNotMatch(workflow, /\n\s+cache: npm\n/);
  });
}

test('read-only Foundation QA may retain lock-keyed npm cache', () => {
  assert.match(qaWorkflow, /cache: npm/);
});
