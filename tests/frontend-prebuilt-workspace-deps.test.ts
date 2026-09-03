import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

test('frontend prebuilt deployment exposes only missing locked hoisted dependencies', () => {
  const bridge = workflow.indexOf('Expose hoisted workspace dependencies to prebuilt deployer');
  const webDeploy = workflow.indexOf('Deploy prebuilt Web artifact as protected staged production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin artifact as protected staged production');

  assert.ok(bridge >= 0, 'workspace dependency bridge step must exist');
  assert.ok(webDeploy > bridge, 'Web deploy must run after workspace dependency bridge');
  assert.ok(adminDeploy > webDeploy, 'Admin deploy must remain after Web deploy');
  assert.match(workflow, /test -f node_modules\/client-only\/index\.js/);
  assert.match(workflow, /test -f node_modules\/next\/dist\/compiled\/@opentelemetry\/api\/index\.js/);
  assert.match(workflow, /mkdir -p "\$app\/node_modules"/);
  assert.match(workflow, /ln -s \.\.\/\.\.\/\.\.\/node_modules\/client-only "\$app\/node_modules\/client-only"/);
  assert.match(workflow, /ln -s \.\.\/\.\.\/\.\.\/node_modules\/next "\$app\/node_modules\/next"/);
  assert.match(workflow, /test -f "\$app\/node_modules\/client-only\/index\.js"/);
  assert.match(workflow, /test -f "\$app\/node_modules\/next\/dist\/compiled\/@opentelemetry\/api\/index\.js"/);
  assert.doesNotMatch(workflow, /unexpectedly populated; refusing to replace it/);
  assert.doesNotMatch(workflow, /ln -s \.\.\/\.\.\/node_modules "\$app\/node_modules"/);
});
