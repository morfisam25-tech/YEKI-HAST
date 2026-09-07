import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const kycRoute = await readFile(new URL('../services/api/src/routes/kyc.ts', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

test('technical beta disables KYC provider selection in controlled production', () => {
  assert.match(envSync, /setPlain\('KYC_INQUIRY_PROVIDER', ''\)/);
});

test('listener KYC submission authenticates first but refuses sensitive payload collection before provider readiness', () => {
  assert.match(kycRoute, /validateKycInquiryProviderEnv/);
  assert.match(kycRoute, /kyc_provider_not_configured/);
  const auth = kycRoute.indexOf('await requireAuth(req)');
  const providerGate = kycRoute.indexOf('requireKycSubmissionProvider();');
  const bodyRead = kycRoute.indexOf('await readJson<');
  const encryption = kycRoute.indexOf('encryptPrivateText(legalName');
  assert.ok(auth >= 0 && providerGate > auth && bodyRead > providerGate && encryption > bodyRead);
});