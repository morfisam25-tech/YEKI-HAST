import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const workflow = readFileSync('.github/workflows/verify-promote-frontends-v4.yml', 'utf8');

function indexOfOrFail(needle: string): number {
  const index = workflow.indexOf(needle);
  assert.notEqual(index, -1, `missing workflow marker: ${needle}`);
  return index;
}

describe('V4 existing deployment verification/promote workflow', () => {
  it('is pinned to the exact already-created V4 deployments and release source', () => {
    assert.match(workflow, /RELEASE_SHA: 39b3e58a352db6b61338739b4d20f19c2006f125/);
    assert.match(workflow, /WEB_EXACT_DEPLOYMENT_URL: https:\/\/web-gax4jiw5k-unique-6ff0\.vercel\.app/);
    assert.match(workflow, /ADMIN_EXACT_DEPLOYMENT_URL: https:\/\/admin-4xoi0aw5d-unique-6ff0\.vercel\.app/);
    assert.match(workflow, /git diff --quiet "\$RELEASE_SHA" "\$GITHUB_SHA" -- apps\/web apps\/admin packages package\.json package-lock\.json/);
  });

  it('does not build or create another deployment', () => {
    assert.doesNotMatch(workflow, /vercel build/);
    assert.doesNotMatch(workflow, /vercel deploy/);
    assert.doesNotMatch(workflow, /\$VERCEL_BIN" build/);
    assert.doesNotMatch(workflow, /\$VERCEL_BIN" deploy/);
  });

  it('verifies READY identity and protection before authenticated smoke', () => {
    const ready = indexOfOrFail('Require exact V4 deployments READY and owned by expected projects');
    const protection = indexOfOrFail('Require exact V4 deployment URLs remain protected unauthenticated');
    const adminSmoke = indexOfOrFail('Authenticated smoke exact Admin deployment with real SSR markers');
    assert.ok(ready < protection && protection < adminSmoke);
    assert.match(workflow, /deployment\.readyState !== 'READY'/);
    assert.match(workflow, /deployment\.projectId !== projectId/);
  });

  it('uses non-interactive protected curl and real Admin SSR markers', () => {
    assert.match(workflow, /--deployment "\$ADMIN_EXACT_DEPLOYMENT_URL"[\s\S]*?--yes/);
    assert.match(workflow, /--deployment "\$WEB_EXACT_DEPLOYMENT_URL"[\s\S]*?--yes/);
    assert.match(workflow, /یکی هست \/ عملیات/);
    assert.match(workflow, /در حال بررسی نشست ادمین/);
    assert.doesNotMatch(workflow, /grep -Fq 'داشبورد'/);
  });

  it('promotes only after both exact smokes and verifies canonical surfaces', () => {
    const adminSmoke = indexOfOrFail('Authenticated smoke exact Admin deployment with real SSR markers');
    const webSmoke = indexOfOrFail('Authenticated smoke exact Web deployment');
    const adminPromote = indexOfOrFail('Promote verified Admin deployment');
    const adminProtection = indexOfOrFail('Require Admin canonical remains protected');
    const webPromote = indexOfOrFail('Promote verified Web deployment to public production');
    const publicVerify = indexOfOrFail('Verify public Web canonical surfaces');
    const rollback = indexOfOrFail('Roll back Web if final public verification fails');
    assert.ok(adminSmoke < webSmoke && webSmoke < adminPromote);
    assert.ok(adminPromote < adminProtection && adminProtection < webPromote);
    assert.ok(webPromote < publicVerify && publicVerify < rollback);
    assert.match(workflow, /\/privacy/);
    assert.match(workflow, /\/terms/);
    assert.match(workflow, /\/account\/delete/);
  });
});
