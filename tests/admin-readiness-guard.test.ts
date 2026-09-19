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
  assert.match(source, /validatePrimaryCallTransportEnv/);
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

test('caller age readiness is fixed to the public 18+ policy', () => {
  assert.match(source, /CALLER_AGE_POLICY_VERSION/);
  assert.match(source, /CALLER_MINIMUM_AGE/);
  assert.match(source, /=== 18/);
  assert.doesNotMatch(source, />= 13|<= 99/);
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

test('Caller launch readiness stays fail-closed until every v1.2 primary-transport dependency is ready', () => {
  assert.match(source, /isCallerClosedBetaConfigured/);
  assert.match(source, /isCallerClosedBetaEnabled/);
  assert.match(source, /callerLaunchReady = callerClosedBetaConfigured[\s\S]*commercialHostingApproved[\s\S]*callerAgePolicyReady[\s\S]*callerCatalogReady[\s\S]*accountAuthReady[\s\S]*callTransportReady[\s\S]*paymentReady[\s\S]*kycInquiryReady[\s\S]*sensitiveDataReady[\s\S]*adminBootstrapLockedDown[\s\S]*publicRelease\.ready/);
  const callerLaunchBlock = source.match(/const callerLaunchReady =[\s\S]*?;/)?.[0] ?? '';
  assert.doesNotMatch(callerLaunchBlock, /callPhoneVerificationReady/);
  assert.doesNotMatch(callerLaunchBlock, /telephonyReady/);
  assert.match(source, /callerClosedBeta: \{ configured: callerClosedBetaConfigured, enabled: callerClosedBetaEnabled \}/);
  assert.match(source, /callerLaunch: \{ ready: callerLaunchReady \}/);
});

// W78: kycInquiryReady was computed and reported (integrations.kycInquiry)
// but never actually gated callerLaunchReady -- meaning the paid Caller
// marketplace could report itself launch-ready with no working path for a
// Listener to ever complete KYC. Fixed by adding it as a required conjunct.
test('paid Caller launch readiness requires the KYC inquiry provider exactly as strictly as it requires payment', () => {
  const callerLaunchBlock = source.match(/const callerLaunchReady =[\s\S]*?;/)?.[0] ?? '';
  assert.match(callerLaunchBlock, /&&\s*paymentReady/);
  assert.match(callerLaunchBlock, /&&\s*kycInquiryReady/);
  // A pure &&-chain with no || means: paymentReady=true/kycInquiryReady=false
  // (or the reverse) forces callerLaunchReady=false, and both true (with
  // every other existing conjunct also true) is required and sufficient for
  // callerLaunchReady=true -- proving the exact truth table this gate needs
  // without requiring a live DB-backed integration run.
  assert.doesNotMatch(callerLaunchBlock, /\|\|/);
});

test('public site and Gmail email-OTP auth readiness stay independent of payment/KYC readiness', () => {
  // accountAuthReady (email OTP or SMS) is computed from emailAuthReady/smsReady
  // only, never from paymentReady/kycInquiryReady, and getPublicReleaseConfig's
  // own readiness is a separate legal/support-surface check -- neither the
  // public site nor login gates on the paid-marketplace providers.
  const accountAuthLine = source.split('\n').find((line) => line.includes('const accountAuthReady =')) ?? '';
  assert.match(accountAuthLine, /^\s*const accountAuthReady = emailAuthReady \|\| smsReady;\s*$/);
});
