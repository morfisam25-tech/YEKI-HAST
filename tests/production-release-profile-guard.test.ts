import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

// W63 section 11: scripts/sync-vercel-production-env.mjs has supported
// PRODUCTION_RELEASE_PROFILE (internal_beta | public_release) since it was
// introduced, but .github/workflows/deploy-production-api.yml -- the only
// caller that invokes it in Production -- never passed a value, so every
// deploy silently used the optional('...', 'internal_beta') fallback. Closed
// by making release_profile a required workflow_dispatch choice input wired
// straight through, with no automatic Public Release default and no way for
// selecting Public Release alone to bypass the recording/hosting/payment/
// KYC/payout gates that already live in sync-vercel-production-env.mjs.

test('deploy workflow requires an explicit release_profile choice with Internal Beta first (never Public Release by default)', () => {
  assert.match(workflow, /release_profile:/);
  assert.match(workflow, /description: 'Production release profile for this deploy'/);
  assert.match(workflow, /required: true/);
  assert.match(workflow, /type: choice/);
  const inputBlock = workflow.match(/release_profile:[\s\S]*?options:\n(\s*- internal_beta\n\s*- public_release)/);
  assert.ok(inputBlock, 'release_profile choice options must list internal_beta before public_release');
});

test('deploy workflow wires the dispatch choice straight to PRODUCTION_RELEASE_PROFILE and validates it', () => {
  assert.match(workflow, /PRODUCTION_RELEASE_PROFILE: \$\{\{ github\.event\.inputs\.release_profile \}\}/);
  assert.match(workflow, /if \[ "\$PRODUCTION_RELEASE_PROFILE" != "internal_beta" \] && \[ "\$PRODUCTION_RELEASE_PROFILE" != "public_release" \]; then/);
  assert.match(workflow, /release_profile must be an explicit choice of internal_beta or public_release/);
  // The manual DEPLOY-PRODUCTION-API confirmation phrase is unchanged by this fix.
  assert.match(workflow, /DEPLOY-PRODUCTION-API/);
});

test('sync script still fails closed on an unrecognized profile and Public Release alone never opens Caller or providers', () => {
  assert.match(envSync, /optional\('PRODUCTION_RELEASE_PROFILE', 'internal_beta'\)/);
  assert.match(envSync, /must be internal_beta or public_release/);
  assert.match(envSync, /if \(releaseProfile === 'internal_beta'\) \{/);
  const publicBranch = envSync.match(/\} else \{[\s\S]*?\n\}/)?.[0] ?? '';
  // Positive assertion: Public Release only ever writes the immutable 18+
  // consent-version pair here, nothing that flips Caller on or activates a provider.
  assert.match(publicBranch, /CALLER_MINIMUM_AGE/);
  assert.match(publicBranch, /CALLER_AGE_POLICY_VERSION/);
  for (const bypassKey of [
    "setPlain\\('CALLER_CLOSED_BETA_ENABLED', 'true'\\)",
    "setPlain\\('SMS_PROVIDER', '[^']+'\\)",
    "setPlain\\('PAYMENT_PROVIDER', '[^']+'\\)",
    "setPlain\\('KYC_INQUIRY_PROVIDER', '[^']+'\\)",
    "setPlain\\('PAYOUT_PROVIDER', '[^']+'\\)",
    "setPlain\\('TELEPHONY_PROVIDER', '[^']+'\\)",
  ]) {
    assert.doesNotMatch(publicBranch, new RegExp(bypassKey), `public_release branch must not set ${bypassKey}`);
  }
  assert.match(envSync, /INTERNAL_BETA_OWNER_TEST_MODE/);
  assert.match(envSync, /BOOTSTRAP_ADMIN_ENABLED', 'false'/);
});
