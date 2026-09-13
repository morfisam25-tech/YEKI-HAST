import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = (await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

const webProjectId = 'prj_afhSiMYpsCfIAxuOmotLAWBvTMDg';
const adminProjectId = 'prj_l18v3f003ORfiN6hKxYwJbvVPzzC';

test('controlled frontend release uses free standard Web protection and staged production promotion', () => {
  assert.match(workflow, /WEB_PROJECT_ID: prj_afhSiMYpsCfIAxuOmotLAWBvTMDg/);
  assert.match(workflow, /ADMIN_PROJECT_ID: prj_l18v3f003ORfiN6hKxYwJbvVPzzC/);
  assert.ok(workflow.includes(webProjectId));
  assert.ok(workflow.includes(adminProjectId));
  assert.match(workflow, /api\.vercel\.com\/v9\/projects/);
  assert.match(workflow, /method: 'PATCH'/);
  assert.match(workflow, /deploymentType: 'prod_deployment_urls_and_all_previews'/);
  assert.doesNotMatch(workflow, /deploymentType: 'all'/);
  assert.doesNotMatch(workflow, /JSON\.stringify\(\{ ssoProtection: null \}\)/);
  assert.match(workflow, /--prod \\\n\s+--skip-domain/);
  assert.match(workflow, /Promote only verified Web release to public production/);
  assert.match(workflow, /"\$VERCEL_BIN" promote "\$WEB_EXACT_DEPLOYMENT_URL"/);
  assert.doesNotMatch(workflow, /project protection (?:enable|disable)/);
});

test('Admin remains fail-closed without attempting a paid all-deployments protection mutation', () => {
  const preflightStart = workflow.indexOf('Configure staged Web protection and require Admin fail-closed before any frontend deployment');
  const bindStart = workflow.indexOf('Bind exact UNIQUE projects');
  assert.ok(preflightStart >= 0 && bindStart > preflightStart);
  const preflight = workflow.slice(preflightStart, bindStart);
  assert.match(preflight, /process\.env\.WEB_PROJECT_ID/);
  assert.match(preflight, /process\.env\.ADMIN_PRODUCTION_URL/);
  assert.doesNotMatch(preflight, /process\.env\.ADMIN_PROJECT_ID/);
  assert.match(preflight, /production Admin pre-deploy protection PASS/);

  assert.match(workflow, /Require staged Web and Admin deployment URLs protected from unauthenticated access/);
  assert.match(workflow, /Verify exact protected Admin deployment shell with authenticated Vercel CLI/);
  assert.match(workflow, /production exact protected Admin smoke PASS/);
  assert.match(workflow, /Promote verified Admin release while keeping canonical protected/);
  assert.match(workflow, /Require promoted Admin canonical to remain protected from unauthenticated access/);
  assert.match(workflow, /production Admin protection PASS/);
});

test('frontend release resolves Vercel only from the workspace install', () => {
  assert.match(workflow, /VERCEL_BIN: \$\{\{ github\.workspace \}\}\/node_modules\/\.bin\/vercel/);
  assert.match(workflow, /test -x "\$VERCEL_BIN"/);
  assert.doesNotMatch(workflow, /npx --yes vercel@/);
  assert.doesNotMatch(workflow, /npx --no-install vercel/);
});
