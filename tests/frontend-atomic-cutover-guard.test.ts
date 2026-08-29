import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-frontends.yml', import.meta.url), 'utf8');

test('Web is not made public until both exact frontend deployments and protected smoke checks pass', () => {
  const webDeploy = workflow.indexOf('Deploy prebuilt Web artifact to protected UNIQUE production');
  const adminDeploy = workflow.indexOf('Deploy prebuilt Admin artifact to UNIQUE production');
  const adminSmoke = workflow.indexOf('Verify exact protected Admin deployment shell with authenticated Vercel CLI');
  const webProtectedSmoke = workflow.indexOf('Verify exact protected Web release before public cutover');
  const publicCutover = workflow.indexOf('Make only verified Web release public');
  const publicSmoke = workflow.indexOf('Verify Web canonical production alias public surfaces');

  assert.ok(webDeploy >= 0);
  assert.ok(adminDeploy > webDeploy);
  assert.ok(adminSmoke > adminDeploy);
  assert.ok(webProtectedSmoke > adminSmoke);
  assert.ok(publicCutover > webProtectedSmoke);
  assert.ok(publicSmoke > publicCutover);
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

test('a failed public cutover requests Web SSO re-protection', () => {
  assert.match(workflow, /Re-protect Web if public cutover fails/);
  assert.match(workflow, /if: \$\{\{ failure\(\) \}\}/);
  assert.match(workflow, /project protection enable "\$WEB_PROJECT_NAME"/);
  assert.match(workflow, /--sso/);
  assert.match(workflow, /production Web re-protection requested after failed release/);
  assert.doesNotMatch(workflow, /project protection (?:enable|disable) "\$ADMIN_PROJECT_NAME"/);
});
