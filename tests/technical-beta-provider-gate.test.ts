import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const callerBeta = await readFile(new URL('../services/api/src/lib/caller-beta.ts', import.meta.url), 'utf8');

const closedProviderCredentials = [
  'NEXTPAY_API_KEY',
  'NEXTPAY_INQUIRY_API',
  'NEXTPAY_PAYOUT_WID',
  'NEXTPAY_PAYOUT_AUTH',
  'TELEPHONY_PROVIDER',
  'KYC_INQUIRY_PROVIDER',
  'PAYOUT_PROVIDER',
  'PAYMENT_PROVIDER',
  'SMSIR_API_KEY',
  'KAVENEGAR_API_KEY',
  'IPPANEL_API_KEY',
];

test('smallest technical beta deploy does not require closed-provider credentials', () => {
  for (const name of closedProviderCredentials) {
    assert.doesNotMatch(apiWorkflow, new RegExp(`secrets\\.${name}`));
  }
});

test('production env sync keeps provider-gated caller surfaces closed by default', () => {
  assert.match(envSync, /CALLER_CLOSED_BETA_ENABLED', 'false'/);
  assert.match(envSync, /MANUAL_PHONE_VERIFICATION_BETA_ENABLED', 'false'/);
  assert.match(envSync, /DEV_EXPOSE_OTP', 'false'/);
  assert.match(envSync, /COMMERCIAL_HOSTING_APPROVED', commercialHostingApproved/);
  assert.doesNotMatch(envSync, /DEV_EXPOSE_OTP', 'true'/);
});

test('production caller cannot open without explicit commercial-hosting approval', () => {
  assert.match(callerBeta, /CALLER_CLOSED_BETA_ENABLED/);
  assert.match(callerBeta, /COMMERCIAL_HOSTING_APPROVED/);
  assert.match(callerBeta, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(callerBeta, /commercial_hosting_not_approved/);
  assert.match(callerBeta, /return isCommercialHostingApproved\(\)/);
});
