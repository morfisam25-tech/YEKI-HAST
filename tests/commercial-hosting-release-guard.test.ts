import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const callerGate = await readFile(new URL('../services/api/src/lib/caller-beta.ts', import.meta.url), 'utf8');
const readiness = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../apps/admin/app/readiness/page.tsx', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const verifier = await readFile(new URL('../scripts/verify-production-security-config.mjs', import.meta.url), 'utf8');
const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');

test('commercial hosting approval defaults fail-closed everywhere', () => {
  assert.match(envExample, /^COMMERCIAL_HOSTING_APPROVED=false$/m);
  assert.match(envSync, /optional\('PRODUCTION_COMMERCIAL_HOSTING_APPROVED', 'false'\)/);
  assert.match(envSync, /setPlain\('COMMERCIAL_HOSTING_APPROVED', commercialHostingApproved\)/);
  assert.match(callerGate, /COMMERCIAL_HOSTING_APPROVED\?\.trim\(\)\.toLowerCase\(\) === 'true'/);
});

test('production deploy can receive hosting approval only through an explicit non-secret repository variable', () => {
  assert.match(apiWorkflow, /PRODUCTION_COMMERCIAL_HOSTING_APPROVED: \$\{\{ vars\.PRODUCTION_COMMERCIAL_HOSTING_APPROVED \}\}/);
  assert.doesNotMatch(apiWorkflow, /PRODUCTION_COMMERCIAL_HOSTING_APPROVED: \$\{\{ secrets\./);
});

test('production security verifier rejects Caller opening without commercial hosting approval', () => {
  assert.match(verifier, /if \(!boolean\('COMMERCIAL_HOSTING_APPROVED'\)\)/);
  assert.match(verifier, /COMMERCIAL_HOSTING_APPROVED must be true before production Caller can open/);
});

test('Admin readiness and UI expose the hosting gate without exposing plan credentials', () => {
  assert.match(readiness, /commercialHosting: \{ ready: commercialHostingApproved \}/);
  assert.match(readiness, /callerLaunchReady = callerClosedBetaConfigured[\s\S]*&& commercialHostingApproved/);
  assert.match(adminPage, /commercialHosting: Integration/);
  assert.match(adminPage, /\['commercialHosting', 'میزبانی تجاری'\]/);
  assert.match(adminPage, /تأیید استفاده تجاری/);
  assert.doesNotMatch(adminPage, /VERCEL_TOKEN|billingToken|paymentMethod/);
});
