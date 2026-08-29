import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

const webProjectId = 'prj_afhSiMYpsCfIAxuOmotLAWBvTMDg';
const adminProjectId = 'prj_l18v3f003ORfiN6hKxYwJbvVPzzC';

test('controlled frontend release disables Vercel Authentication only for Web', () => {
  assert.match(workflow, /WEB_PROJECT_ID: prj_afhSiMYpsCfIAxuOmotLAWBvTMDg/);
  assert.match(workflow, /WEB_PROJECT_NAME: web/);
  assert.match(workflow, /project protection disable "\$WEB_PROJECT_NAME"/);
  assert.match(workflow, /--sso/);
  assert.doesNotMatch(workflow, /project protection disable "\$ADMIN_PROJECT_NAME"/);
  assert.ok(workflow.includes(webProjectId));
  assert.ok(workflow.includes(adminProjectId));
});

test('Admin remains fail-closed to unauthenticated visitors and is then checked with authenticated CLI access', () => {
  assert.match(workflow, /Require Admin to remain protected from unauthenticated access/);
  assert.match(workflow, /redirect: 'manual'/);
  assert.match(workflow, /response\.status >= 300 && response\.status < 400/);
  assert.match(workflow, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(workflow, /production Admin protection PASS/);
  assert.match(workflow, /Verify protected Admin production shell with authenticated Vercel CLI/);
  assert.match(workflow, /"\$VERCEL_BIN" curl \/ /);
  assert.match(workflow, /production protected Admin smoke PASS/);

  const unauthenticatedGuard = workflow.indexOf('Require Admin to remain protected from unauthenticated access');
  const authenticatedSmoke = workflow.indexOf('Verify protected Admin production shell with authenticated Vercel CLI');
  assert.ok(unauthenticatedGuard >= 0 && authenticatedSmoke > unauthenticatedGuard);
});

test('frontend release resolves Vercel only from the workspace install', () => {
  assert.match(workflow, /VERCEL_BIN: \$\{\{ github\.workspace \}\}\/node_modules\/\.bin\/vercel/);
  assert.match(workflow, /test -x "\$VERCEL_BIN"/);
  assert.doesNotMatch(workflow, /npx --yes vercel@/);
  assert.doesNotMatch(workflow, /npx --no-install vercel/);
});
