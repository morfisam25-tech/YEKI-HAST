import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-web-v2.yml', import.meta.url), 'utf8');

test('Web V2 stages before custom-domain promotion and verifies the exact protected deployment', () => {
  assert.match(workflow, /deploy --prebuilt --prod --skip-domain/);
  assert.match(workflow, /Require exact staged deployment READY and protected/);
  assert.match(workflow, /Authenticated smoke exact staged deployment/);
  assert.match(workflow, /vercel\.app/);
  assert.match(workflow, /"\$VERCEL_BIN" curl "\$path" --deployment "\$WEB_EXACT_DEPLOYMENT_URL"/);
});

test('skip-domain invariant is checked against the real primary custom domain rather than the project vercel.app alias', () => {
  assert.match(workflow, /WEB_PRIMARY_DOMAIN: https:\/\/yekihast\.app/);
  assert.match(workflow, /Require custom production domain stayed on prior deployment during stage/);
  assert.match(workflow, /new URL\(process\.env\.WEB_PRIMARY_DOMAIN\)\.host/);
  assert.doesNotMatch(workflow, /Require skip-domain left Web canonical on previous deployment/);
});

test('post-promotion failure restores the prior deployment through supported promotion rather than the rejected rollback API path', () => {
  assert.match(workflow, /Restore prior verified deployment if post-promotion verification fails/);
  assert.match(workflow, /promote \"\$PREVIOUS_DEPLOYMENT_URL\" --yes/);
  assert.doesNotMatch(workflow, /\/v1\/projects\/\$\{encodeURIComponent\(projectId\)\}\/rollback/);
});

test('production domain policy remains primary plus three permanent redirects', () => {
  assert.match(workflow, /WEB_PRIMARY_WWW: www\.yekihast\.app/);
  assert.match(workflow, /WEB_SECONDARY_DOMAIN: yeki-hast\.com/);
  assert.match(workflow, /WEB_SECONDARY_WWW: www\.yeki-hast\.com/);
  assert.match(workflow, /Number\(row\.redirectStatusCode\) !== 308/);
});
