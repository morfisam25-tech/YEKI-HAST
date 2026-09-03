import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

const webProjectId = 'prj_afhSiMYpsCfIAxuOmotLAWBvTMDg';
const adminProjectId = 'prj_l18v3f003ORfiN6hKxYwJbvVPzzC';

test('controlled frontend release uses the Vercel project API and opens only Web', () => {
  assert.match(workflow, /WEB_PROJECT_ID: prj_afhSiMYpsCfIAxuOmotLAWBvTMDg/);
  assert.match(workflow, /ADMIN_PROJECT_ID: prj_l18v3f003ORfiN6hKxYwJbvVPzzC/);
  assert.ok(workflow.includes(webProjectId));
  assert.ok(workflow.includes(adminProjectId));
  assert.match(workflow, /api\.vercel\.com\/v9\/projects/);
  assert.match(workflow, /method: 'PATCH'/);
  assert.match(workflow, /JSON\.stringify\(\{ ssoProtection: value \}\)/);
  assert.match(workflow, /deploymentType: 'all'/);

  const publicCutoverStart = workflow.indexOf('Make only verified Web release public');
  const publicSmokeStart = workflow.indexOf('Verify Web canonical production alias public surfaces');
  assert.ok(publicCutoverStart >= 0 && publicSmokeStart > publicCutoverStart);
  const publicCutover = workflow.slice(publicCutoverStart, publicSmokeStart);
  assert.match(publicCutover, /process\.env\.WEB_PROJECT_ID/);
  assert.match(publicCutover, /JSON\.stringify\(\{ ssoProtection: null \}\)/);
  assert.doesNotMatch(publicCutover, /ADMIN_PROJECT_ID/);
  assert.doesNotMatch(workflow, /project protection (?:enable|disable)/);
});

test('Admin remains fail-closed to unauthenticated visitors and is then checked with authenticated CLI access', () => {
  assert.match(workflow, /Require Admin to remain protected from unauthenticated access/);
  assert.match(workflow, /redirect: 'manual'/);
  assert.match(workflow, /response\.status >= 300 && response\.status < 400/);
  assert.match(workflow, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(workflow, /production Admin protection PASS/);
  assert.match(workflow, /Verify exact protected Admin deployment shell with authenticated Vercel CLI/);
  assert.match(workflow, /"\$VERCEL_BIN" curl \/ /);
  assert.match(workflow, /production exact protected Admin smoke PASS/);

  const unauthenticatedGuard = workflow.indexOf('Require Admin to remain protected from unauthenticated access');
  const authenticatedSmoke = workflow.indexOf('Verify exact protected Admin deployment shell with authenticated Vercel CLI');
  assert.ok(unauthenticatedGuard >= 0 && authenticatedSmoke > unauthenticatedGuard);
});

test('frontend release resolves Vercel only from the workspace install', () => {
  assert.match(workflow, /VERCEL_BIN: \$\{\{ github\.workspace \}\}\/node_modules\/\.bin\/vercel/);
  assert.match(workflow, /test -x "\$VERCEL_BIN"/);
  assert.doesNotMatch(workflow, /npx --yes vercel@/);
  assert.doesNotMatch(workflow, /npx --no-install vercel/);
});
