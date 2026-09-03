import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

test('frontend prebuilt deployment mirrors missing locked hoisted dependencies without replacing workspace node_modules', () => {
  const bridge = workflow.indexOf('Expose hoisted workspace dependencies to prebuilt deployer');
  const webDeploy = workflow.indexOf('Deploy prebuilt Web artifact as protected staged production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin artifact as protected staged production');

  assert.ok(bridge >= 0, 'workspace dependency mirror step must exist');
  assert.ok(webDeploy > bridge, 'Web deploy must run after workspace dependency mirror');
  assert.ok(adminDeploy > webDeploy, 'Admin deploy must remain after Web deploy');

  assert.match(workflow, /test -f node_modules\/client-only\/index\.js/);
  assert.match(workflow, /test -f node_modules\/next\/dist\/compiled\/@opentelemetry\/api\/index\.js/);
  assert.match(workflow, /test -f node_modules\/react\/cjs\/react\.production\.js/);
  assert.match(workflow, /test -f node_modules\/react-dom\/cjs\/react-dom\.production\.js/);
  assert.match(workflow, /for root_entry in node_modules\/\*/);
  assert.match(workflow, /if \[ "\$name" = "@yeki-hast" \]; then/);
  assert.match(workflow, /for scoped_entry in "\$root_entry"\/\*/);
  assert.match(workflow, /ln -s "\.\.\/\.\.\/\.\.\/node_modules\/\$name" "\$target"/);
  assert.match(workflow, /ln -s "\.\.\/\.\.\/\.\.\/\.\.\/node_modules\/\$name\/\$package" "\$target"/);
  assert.match(workflow, /test -f "\$app\/node_modules\/react\/cjs\/react\.production\.js"/);
  assert.match(workflow, /test -f "\$app\/node_modules\/react-dom\/cjs\/react-dom\.production\.js"/);
  assert.match(workflow, /workspace hoisted dependency mirror PASS/);

  assert.doesNotMatch(workflow, /unexpectedly populated; refusing to replace it/);
  assert.doesNotMatch(workflow, /ln -s \.\.\/\.\.\/node_modules "\$app\/node_modules"/);
});
