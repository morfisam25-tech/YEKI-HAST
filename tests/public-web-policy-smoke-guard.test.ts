import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

for (const [path, marker] of [
  ['/privacy', 'حریم خصوصی'],
  ['/terms', 'قوانین استفاده'],
  ['/account/delete', 'حذف حساب'],
] as const) {
  test(`production Web smoke requires public ${path}`, () => {
    assert.ok(workflow.includes(`waitFor('${path}'`));
    assert.ok(workflow.includes(marker));
  });
}

test('public Web smoke remains unauthenticated and rejects protection redirects', () => {
  assert.match(workflow, /redirect: 'manual'/);
  assert.match(workflow, /response\.ok/);
  assert.match(workflow, /production Web public smoke PASS/);
});
