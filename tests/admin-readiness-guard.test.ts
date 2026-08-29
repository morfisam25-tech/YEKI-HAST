import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');

test('integration readiness requires admin authentication', () => {
  assert.match(source, /await requireAdmin\(req\)/);
});

test('integration readiness validates providers and sensitive-data security without exposing secrets', () => {
  assert.match(source, /getSmsProvider/);
  assert.match(source, /validatePaymentProviderEnv/);
  assert.match(source, /validatePayoutProviderEnv/);
  assert.match(source, /validateTelephonyEnv/);
  assert.match(source, /validateKycInquiryProviderEnv/);
  assert.match(source, /validateSecurityEnv/);
  assert.match(source, /const sensitiveDataReady = ready\(\(\) => validateSecurityEnv\(\)\)/);
  assert.match(source, /sensitiveData: \{ ready: sensitiveDataReady \}/);
  assert.match(source, /secretsIncluded: false/);
  assert.doesNotMatch(source, /sendJson[\s\S]*API_KEY/);
  assert.doesNotMatch(source, /sendJson[\s\S]*PAYOUT_AUTH/);
  assert.doesNotMatch(source, /sendJson[\s\S]*DATA_ENCRYPTION_KEYS/);
  assert.doesNotMatch(source, /sendJson[\s\S]*HASH_PEPPER/);
});

test('Caller catalog readiness follows the shared operating context and active catalog state', () => {
  assert.match(source, /getDefaultOperatingContextCodes/);
  assert.match(source, /const \{ productCode, serviceCode, marketCode \} = getDefaultOperatingContextCodes\(\)/);
  assert.match(source, /FROM app\.pricing_plans pp/);
  assert.match(source, /p\.code=\$1/);
  assert.match(source, /s\.code=\$2 AND s\.status='active'/);
  assert.match(source, /m\.code=\$3 AND m\.is_active=true/);
  assert.match(source, /pp\.is_active=true/);
  assert.match(source, /FROM app\.languages WHERE is_active=true/);
  assert.match(source, /callerCatalog: \{ ready: callerCatalogReady \}/);
});

test('caller age readiness uses bounded policy values', () => {
  assert.match(source, /CALLER_AGE_POLICY_VERSION/);
  assert.match(source, /CALLER_MINIMUM_AGE/);
  assert.match(source, />= 13/);
  assert.match(source, /<= 99/);
});

test('admin bootstrap must be completely disarmed before caller launch can become ready', () => {
  assert.match(source, /BOOTSTRAP_ADMIN_ENABLED/);
  assert.match(source, /BOOTSTRAP_ADMIN_EMAIL/);
  assert.match(source, /BOOTSTRAP_ADMIN_PHONE_E164/);
  assert.match(source, /BOOTSTRAP_ADMIN_EXPIRES_AT/);
  assert.match(source, /isAdminBootstrapWindowOpen\(\)/);
  assert.match(source, /adminBootstrapLockedDown = !bootstrapAdminEnabled[\s\S]*&& !bootstrapAdminIdentityConfigured[\s\S]*&& !bootstrapAdminExpiryConfigured/);
  assert.match(source, /adminBootstrap: \{[\s\S]*lockedDown: adminBootstrapLockedDown[\s\S]*enabled: bootstrapAdminEnabled[\s\S]*identityConfigured: bootstrapAdminIdentityConfigured[\s\S]*expiryConfigured: bootstrapAdminExpiryConfigured[\s\S]*windowOpen: bootstrapAdminWindowOpen/);
});

test('commercial hosting is an explicit fail-closed Caller launch dependency', () => {
  assert.match(source, /isCommercialHostingApproved/);
  assert.match(source, /const commercialHostingApproved = isCommercialHostingApproved\(\)/);
  assert.match(source, /commercialHosting: \{ ready: commercialHostingApproved \}/);
  assert.match(source, /callerLaunchReady = callerClosedBetaConfigured[\s\S]*&& commercialHostingApproved/);
});

test('Caller launch readiness stays fail-closed until every launch dependency is ready', () => {
  assert.match(source, /isCallerClosedBetaConfigured/);
  assert.match(source, /isCallerClosedBetaEnabled/);
  assert.match(source, /callerLaunchReady = callerClosedBetaConfigured[\s\S]*commercialHostingApproved[\s\S]*callerAgePolicyReady[\s\S]*callerCatalogReady[\s\S]*accountAuthReady[\s\S]*callPhoneVerificationReady[\s\S]*paymentReady[\s\S]*telephonyReady[\s\S]*sensitiveDataReady[\s\S]*adminBootstrapLockedDown[\s\S]*publicRelease\.ready/);
  assert.match(source, /callerClosedBeta: \{ configured: callerClosedBetaConfigured, enabled: callerClosedBetaEnabled \}/);
  assert.match(source, /callerLaunch: \{ ready: callerLaunchReady \}/);
});
