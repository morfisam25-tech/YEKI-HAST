import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/deploy-production-frontends-v2.yml', import.meta.url),
  'utf8',
);

test('V2 frontend release uses Vercel repo-level monorepo linking before prebuilt deploy', () => {
  const bind = workflow.indexOf('Bind exact UNIQUE projects through Vercel repo-level monorepo link');
  const webPull = workflow.indexOf('Pull Web production settings through repo-level link');
  const webBuild = workflow.indexOf('Build Web production artifact from locked workspace');
  const context = workflow.indexOf('Verify monorepo-root prebuilt source context');
  const webDeploy = workflow.indexOf('Deploy prebuilt Web artifact as protected staged production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin artifact as protected staged production');

  assert.ok(bind >= 0, 'repo-level Vercel link step must exist');
  assert.ok(webPull > bind, 'Web pull must run after repo-level link');
  assert.ok(webBuild > webPull, 'Web build must run after Web pull');
  assert.ok(context > webBuild, 'monorepo-root context validation must run after builds');
  assert.ok(webDeploy > context, 'Web deploy must run after monorepo-root context validation');
  assert.ok(adminDeploy > webDeploy, 'Admin deploy must remain after Web deploy');

  assert.match(workflow, /WEB_PROJECT_ID: prj_afhSiMYpsCfIAxuOmotLAWBvTMDg/);
  assert.match(workflow, /ADMIN_PROJECT_ID: prj_l18v3f003ORfiN6hKxYwJbvVPzzC/);
  assert.match(workflow, /VERCEL_TEAM_ID: team_GmseY3ibD05FWemVhLElL3hI/);
  assert.match(workflow, /VERCEL_TEAM_SLUG: unique-6ff0/);
  assert.match(workflow, /DEPLOY-PRODUCTION-FRONTENDS/);

  assert.match(workflow, /fs\.writeFileSync\('\.vercel\/repo\.json'/);
  assert.match(workflow, /remoteName: 'origin'/);
  assert.match(workflow, /directory: 'apps\/web'/);
  assert.match(workflow, /directory: 'apps\/admin'/);
  assert.match(workflow, /test -f \.\.\/\.\.\/\.vercel\/\.env\.production\.local/);
  assert.match(workflow, /test -f \.\.\/\.\.\/\.vercel\/project\.json/);
  assert.match(workflow, /test -f \.\.\/\.\.\/\.vercel\/repo\.json/);
  assert.match(workflow, /test -f \.vercel\/repo\.json/);
  assert.match(workflow, /test -f apps\/web\/\.vercel\/output\/config\.json/);
  assert.match(workflow, /test -f apps\/admin\/\.vercel\/output\/config\.json/);

  assert.doesNotMatch(workflow, /test -f \.vercel\/\.env\.production\.local/);
  assert.doesNotMatch(workflow, /> apps\/web\/\.vercel\/project\.json/);
  assert.doesNotMatch(workflow, /> apps\/admin\/\.vercel\/project\.json/);
  assert.doesNotMatch(workflow, /workspace hoisted dependency mirror PASS/);

  assert.match(workflow, /deploy --prebuilt --prod --skip-domain --yes/);
  assert.match(workflow, /Require staged Web and Admin deployment URLs protected from unauthenticated access/);
  assert.match(workflow, /Verify exact protected Admin deployment shell with authenticated Vercel CLI/);
  assert.match(workflow, /Verify exact protected Web release before public cutover/);
  assert.match(workflow, /Promote verified Admin release while keeping canonical protected/);
  assert.match(workflow, /Promote only verified Web release to public production/);
  assert.match(workflow, /Verify Web canonical production alias public surfaces/);
  assert.match(workflow, /Roll back Web if post-promotion public verification fails/);
});
