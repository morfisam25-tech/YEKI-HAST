import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/deploy-production-frontends-v3.yml', import.meta.url),
  'utf8',
);

test('V3 stages settings app-locally while preserving repo-level monorepo authority', () => {
  const bind = workflow.indexOf('Bind exact UNIQUE projects through repo-level monorepo link');
  const webStage = workflow.indexOf('Pull and stage Web production settings');
  const webBuild = workflow.indexOf('Build Web production artifact');
  const adminStage = workflow.indexOf('Pull and stage Admin production settings');
  const adminBuild = workflow.indexOf('Build Admin production artifact');
  const context = workflow.indexOf('Verify monorepo-root prebuilt source context');
  const webDeploy = workflow.indexOf('Deploy prebuilt Web as protected staged production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin as protected staged production');

  assert.ok(bind >= 0);
  assert.ok(webStage > bind);
  assert.ok(webBuild > webStage);
  assert.ok(adminStage > webBuild);
  assert.ok(adminBuild > adminStage);
  assert.ok(context > adminBuild);
  assert.ok(webDeploy > context);
  assert.ok(adminDeploy > webDeploy);

  assert.match(workflow, /fs\.writeFileSync\('\.vercel\/repo\.json'/);
  assert.match(workflow, /directory: 'apps\/web'/);
  assert.match(workflow, /directory: 'apps\/admin'/);
  assert.match(workflow, /cp \.\.\/\.\.\/\.vercel\/project\.json \.vercel\/project\.json/g);
  assert.match(workflow, /cp \.\.\/\.\.\/\.vercel\/\.env\.production\.local \.vercel\/\.env\.production\.local/g);
  assert.match(workflow, /project\.projectId \|\| project\.orgId/g);
  assert.match(workflow, /if \(!project\.settings\)/g);

  assert.match(workflow, /WEB_PROJECT_ID: prj_afhSiMYpsCfIAxuOmotLAWBvTMDg/);
  assert.match(workflow, /ADMIN_PROJECT_ID: prj_l18v3f003ORfiN6hKxYwJbvVPzzC/);
  assert.match(workflow, /VERCEL_TEAM_ID: team_GmseY3ibD05FWemVhLElL3hI/);
  assert.match(workflow, /VERCEL_TEAM_SLUG: unique-6ff0/);
  assert.match(workflow, /DEPLOY-PRODUCTION-FRONTENDS/);

  assert.match(workflow, /deploy --prebuilt --prod --skip-domain --yes/g);
  assert.match(workflow, /Require both staged URLs protected unauthenticated/);
  assert.match(workflow, /Authenticated smoke exact Admin deployment/);
  assert.match(workflow, /Authenticated smoke exact Web deployment/);
  assert.match(workflow, /Promote verified Admin/);
  assert.match(workflow, /Require Admin canonical remains protected/);
  assert.match(workflow, /Promote verified Web to public production/);
  assert.match(workflow, /Verify public Web canonical surfaces/);
  assert.match(workflow, /Roll back Web if public verification fails/);
});
