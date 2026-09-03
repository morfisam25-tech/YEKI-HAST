import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/deploy-production-frontends-v4.yml', import.meta.url),
  'utf8',
);

test('V4 builds with app-local links then switches to repo-level link before prebuilt deploy', () => {
  const bindLocal = workflow.indexOf('Bind exact UNIQUE projects locally for proven build phase');
  const webBuild = workflow.indexOf('Build Web production artifact with app-local project context');
  const adminBuild = workflow.indexOf('Build Admin production artifact with app-local project context');
  const switchLink = workflow.indexOf('Switch from app-local build links to repo-level deploy link');
  const webDeploy = workflow.indexOf('Deploy prebuilt Web as protected staged production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin as protected staged production');

  assert.ok(bindLocal >= 0, 'app-local build link phase must exist');
  assert.ok(webBuild > bindLocal, 'Web build must occur after app-local binding');
  assert.ok(adminBuild > webBuild, 'Admin build must occur after Web build');
  assert.ok(switchLink > adminBuild, 'repo-level deploy link switch must occur only after both builds');
  assert.ok(webDeploy > switchLink, 'Web prebuilt deploy must occur after repo-level link switch');
  assert.ok(adminDeploy > webDeploy, 'Admin deploy must remain after Web deploy');

  assert.match(workflow, /printf '\{\"orgId\":\"%s\",\"projectId\":\"%s\"\}\\n'/);
  assert.match(workflow, /rm -f apps\/web\/\.vercel\/project\.json apps\/admin\/\.vercel\/project\.json/);
  assert.match(workflow, /fs\.writeFileSync\('\.vercel\/repo\.json'/);
  assert.match(workflow, /directory: 'apps\/web'/);
  assert.match(workflow, /directory: 'apps\/admin'/);
  assert.match(workflow, /test ! -f apps\/web\/\.vercel\/project\.json/);
  assert.match(workflow, /test ! -f apps\/admin\/\.vercel\/project\.json/);
  assert.match(workflow, /test -f apps\/web\/\.vercel\/output\/config\.json/);
  assert.match(workflow, /test -f apps\/admin\/\.vercel\/output\/config\.json/);

  assert.doesNotMatch(workflow, /cp \.\.\/\.\.\/\.vercel\/project\.json/);
  assert.doesNotMatch(workflow, /workspace hoisted dependency mirror PASS/);

  assert.match(workflow, /deploy --prebuilt --prod --skip-domain --yes/);
  assert.match(workflow, /Require both staged URLs protected unauthenticated/);
  assert.match(workflow, /Authenticated smoke exact Admin deployment/);
  assert.match(workflow, /Authenticated smoke exact Web deployment/);
  assert.match(workflow, /Promote verified Admin/);
  assert.match(workflow, /Promote verified Web to public production/);
  assert.match(workflow, /Verify public Web canonical surfaces/);
  assert.match(workflow, /Roll back Web if public verification fails/);
});
