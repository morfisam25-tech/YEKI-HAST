import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const kycRoute = await readFile(new URL('../services/api/src/routes/kyc.ts', import.meta.url), 'utf8');
const adminKyc = await readFile(new URL('../services/api/src/routes/admin-kyc.ts', import.meta.url), 'utf8');
const webOnboarding = await readFile(new URL('../apps/web/app/listener/page.tsx', import.meta.url), 'utf8');
const mobileKyc = await readFile(new URL('../apps/mobile/src/ListenerKycScreen.tsx', import.meta.url), 'utf8');
const mobileTraining = await readFile(new URL('../apps/mobile/src/ListenerTrainingScreen.tsx', import.meta.url), 'utf8');

test('KYC submission authenticates before provider readiness and cannot overwrite pending review', () => {
  const authIndex = kycRoute.indexOf('const { userId } = await requireAuth(req);');
  const providerIndex = kycRoute.indexOf('requireKycSubmissionProvider();');
  assert.ok(authIndex >= 0 && providerIndex > authIndex);
  assert.match(kycRoute, /current\.rows\[0\]\?\.status === 'pending'/);
  assert.match(kycRoute, /kyc_pending_review/);
});

test('manual admin KYC action is limited to pending evidence', () => {
  assert.match(adminKyc, /row\.kyc_status !== 'pending'/);
  assert.match(adminKyc, /kyc_not_pending/);
  assert.match(adminKyc, /it can never create[\s\S]*a verified identity/);
});

test('Web and Mobile expose explicit provider-disabled and pending-review KYC states', () => {
  for (const source of [webOnboarding, mobileKyc]) {
    assert.match(source, /kyc_provider_not_configured/);
    assert.match(source, /kyc_pending_review/);
  }
});

test('Mobile Listener keeps post-onboarding states read-only instead of replaying training', () => {
  assert.match(mobileTraining, /agreement_pending/);
  assert.match(mobileTraining, /admin_review/);
  assert.match(mobileTraining, /mock_call/);
  assert.match(mobileTraining, /suspended/);
  assert.match(mobileTraining, /rejected/);
  assert.match(mobileTraining, /archived/);
  assert.match(mobileTraining, /این مرحله از داخل برنامه قابل تغییر نیست/);
});
