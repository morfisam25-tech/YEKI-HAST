import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');

test('integration readiness requires admin authentication', () => {
  assert.match(source, /await requireAdmin\(req\)/);
});

test('integration readiness validates providers without exposing secrets', () => {
  assert.match(source, /getSmsProvider/);
  assert.match(source, /validatePaymentProviderEnv/);
  assert.match(source, /validatePayoutProviderEnv/);
  assert.match(source, /validateTelephonyEnv/);
  assert.match(source, /validateKycInquiryProviderEnv/);
  assert.match(source, /secretsIncluded: false/);
  assert.doesNotMatch(source, /sendJson[\s\S]*API_KEY/);
  assert.doesNotMatch(source, /sendJson[\s\S]*PAYOUT_AUTH/);
});

test('caller age readiness uses bounded policy values', () => {
  assert.match(source, /CALLER_AGE_POLICY_VERSION/);
  assert.match(source, /CALLER_MINIMUM_AGE/);
  assert.match(source, />= 13/);
  assert.match(source, /<= 99/);
});

test('Caller launch readiness stays fail-closed until every launch dependency is ready', () => {
  assert.match(source, /CALLER_CLOSED_BETA_ENABLED\?\.trim\(\)\.toLowerCase\(\) === 'true'/);
  assert.match(source, /callerLaunchReady = callerClosedBetaEnabled[\s\S]*callerAgePolicyReady[\s\S]*smsReady[\s\S]*paymentReady[\s\S]*telephonyReady/);
  assert.match(source, /callerClosedBeta: \{ enabled: callerClosedBetaEnabled \}/);
  assert.match(source, /callerLaunch: \{ ready: callerLaunchReady \}/);
});
