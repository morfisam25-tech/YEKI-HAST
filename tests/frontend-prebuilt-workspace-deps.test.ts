import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

test('frontend prebuilt deployment exposes locked hoisted workspace dependencies', () => {
  const bridge = workflow.indexOf('Expose hoisted workspace dependencies to prebuilt deployer');
  const webDeploy = workflow.indexOf('Deploy prebuilt Web artifact to protected UNIQUE production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin artifact to UNIQUE production');

  assert.ok(bridge >= 0, 'workspace dependency bridge step must exist');
  assert.ok(webDeploy > bridge, 'Web deploy must run after workspace dependency bridge');
  assert.ok(adminDeploy > webDeploy, 'Admin deploy must remain after Web deploy');
  assert.match(workflow, /test -f node_modules\/client-only\/index\.js/);
  assert.match(workflow, /ln -s \.\.\/\.\.\/node_modules "\$app\/node_modules"/);
  assert.match(workflow, /test -f "\$app\/node_modules\/client-only\/index\.js"/);
});
