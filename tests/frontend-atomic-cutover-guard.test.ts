import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = (await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

test('Web staged protection is configured and Admin is verified fail-closed before either deployment begins', () => {
  const protectionPreflight = workflow.indexOf('Configure staged Web protection and require Admin fail-closed before any frontend deployment');
  const webDeploy = workflow.indexOf('Deploy prebuilt Web artifact as protected staged production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin artifact as protected staged production');

  assert.ok(protectionPreflight >= 0);
  assert.ok(webDeploy > protectionPreflight);
  assert.ok(adminDeploy > webDeploy);
  assert.match(workflow, /frontend staged protection preflight PASS/);
  assert.match(workflow, /ssoProtection: \{ deploymentType: 'prod_deployment_urls_and_all_previews' \}/);
  assert.match(workflow, /Admin must remain protected before deployment/);
  assert.doesNotMatch(workflow, /deploymentType: 'all'/);
});

test('both production artifacts are staged without domain assignment and protected before authenticated smoke', () => {
  const webDeploy = workflow.indexOf('Deploy prebuilt Web artifact as protected staged production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin artifact as protected staged production');
  const stagedProtection = workflow.indexOf('Require staged Web and Admin deployment URLs protected from unauthenticated access');
  const adminSmoke = workflow.indexOf('Verify exact protected Admin deployment shell with authenticated Vercel CLI');
  const webSmoke = workflow.indexOf('Verify exact protected Web release before public cutover');

  assert.ok(webDeploy >= 0 && adminDeploy > webDeploy);
  assert.ok(stagedProtection > adminDeploy);
  assert.ok(adminSmoke > stagedProtection);
  assert.ok(webSmoke > adminSmoke);
  assert.match(workflow, /--prod \\\n\s+--skip-domain/);
  assert.match(workflow, /staged frontend unauthenticated protection PASS/);
});

test('deploy commands capture exact deployment URLs instead of trusting aliases for pre-cutover smoke', () => {
  assert.match(workflow, /id: deploy_web/);
  assert.match(workflow, /id: deploy_admin/);
  assert.match(workflow, /echo "url=\$deployment_url" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /WEB_EXACT_DEPLOYMENT_URL: \$\{\{ steps\.deploy_web\.outputs\.url \}\}/);
  assert.match(workflow, /ADMIN_EXACT_DEPLOYMENT_URL: \$\{\{ steps\.deploy_admin\.outputs\.url \}\}/);
  assert.match(workflow, /--deployment "\$WEB_EXACT_DEPLOYMENT_URL"/);
  assert.match(workflow, /--deployment "\$ADMIN_EXACT_DEPLOYMENT_URL"/);
});

test('exact protected Web pre-cutover smoke verifies every required public surface through authenticated Vercel access', () => {
  assert.match(workflow, /production exact protected Web pre-cutover smoke PASS/);
  assert.match(workflow, /check_path \/ 'ورود با ایمیل'/);
  assert.match(workflow, /check_path \/privacy 'حریم خصوصی'/);
  assert.match(workflow, /check_path \/terms 'قوانین استفاده'/);
  assert.match(workflow, /check_path \/account\/delete 'تأیید مالک حساب'/);
  assert.match(workflow, /"\$VERCEL_BIN" curl "\$path"/);
});

test('only smoke-verified staged releases are promoted and Web public smoke runs last', () => {
  const adminSmoke = workflow.indexOf('Verify exact protected Admin deployment shell with authenticated Vercel CLI');
  const webSmoke = workflow.indexOf('Verify exact protected Web release before public cutover');
  const adminPromote = workflow.indexOf('Promote verified Admin release while keeping canonical protected');
  const adminProtection = workflow.indexOf('Require promoted Admin canonical to remain protected from unauthenticated access');
  const webPromote = workflow.indexOf('Promote only verified Web release to public production');
  const publicSmoke = workflow.indexOf('Verify Web canonical production alias public surfaces');

  assert.ok(adminPromote > webSmoke && webSmoke > adminSmoke);
  assert.ok(adminProtection > adminPromote);
  assert.ok(webPromote > adminProtection);
  assert.ok(publicSmoke > webPromote);
  assert.match(workflow, /"\$VERCEL_BIN" promote "\$ADMIN_EXACT_DEPLOYMENT_URL"/);
  assert.match(workflow, /"\$VERCEL_BIN" promote "\$WEB_EXACT_DEPLOYMENT_URL"/);
});

test('a failed post-promotion public check rolls Web back instead of requiring a paid protection add-on', () => {
  const recoveryStart = workflow.indexOf('Roll back Web if post-promotion public verification fails');
  assert.ok(recoveryStart >= 0);
  const recovery = workflow.slice(recoveryStart);
  assert.match(recovery, /failure\(\) && steps\.promote_web\.conclusion == 'success'/);
  assert.match(recovery, /"\$VERCEL_BIN" rollback/);
  assert.match(recovery, /rollback status/);
  assert.match(recovery, /production Web rolled back after failed public verification/);
  assert.doesNotMatch(recovery, /ADMIN_PROJECT_ID/);
  assert.doesNotMatch(recovery, /ssoProtection/);
});
