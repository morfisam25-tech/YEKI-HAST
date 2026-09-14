import assert from 'node:assert/strict';
import test from 'node:test';
import { isProductionOrigin, resolveAppEnv } from '../apps/mobile/src/env.ts';
import { PRODUCTION_API_BASE_URL, resolveApiBaseUrl } from '../apps/mobile/src/api.ts';

// W63: closes the verified bug where apps/mobile/eas.json's preview build
// profile hardcoded the exact Production API origin, and apps/mobile/src/api.ts
// fell back to that same literal whenever EXPO_PUBLIC_API_BASE_URL was unset --
// meaning an Internal Beta Preview build silently talked to Production with no
// isolation at all. Mirrors tests/preview-backend-routing-guard.test.ts (the
// W57 web/admin pattern) so mobile gets the exact same fail-closed contract.

const MANAGED_ENV = ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_BASE_URL'] as const;

function withEnv(values: Partial<Record<(typeof MANAGED_ENV)[number], string | undefined>>, run: () => void) {
  const previous = Object.fromEntries(MANAGED_ENV.map((key) => [key, process.env[key]]));
  try {
    for (const key of MANAGED_ENV) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key as (typeof MANAGED_ENV)[number]] = value;
    }
    run();
  } finally {
    for (const key of MANAGED_ENV) {
      const value = previous[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('mobile resolveAppEnv fails closed on an unrecognized EXPO_PUBLIC_APP_ENV value', () => {
  withEnv({ EXPO_PUBLIC_APP_ENV: 'staging' }, () => {
    assert.throws(() => resolveAppEnv(), /EXPO_PUBLIC_APP_ENV has an unrecognized value/);
  });
});

test('mobile resolveAppEnv defaults to local when EXPO_PUBLIC_APP_ENV is unset', () => {
  withEnv({}, () => assert.equal(resolveAppEnv(), 'local'));
});

test('mobile preview_internal_beta with a missing Preview API URL fails closed and never falls back to Production', () => {
  withEnv({ EXPO_PUBLIC_APP_ENV: 'preview_internal_beta' }, () => {
    assert.throws(() => resolveApiBaseUrl(), /required in preview_internal_beta/);
  });
});

test('mobile preview_internal_beta rejects a Preview API URL that points at the Production origin', () => {
  withEnv({ EXPO_PUBLIC_APP_ENV: 'preview_internal_beta', EXPO_PUBLIC_API_BASE_URL: PRODUCTION_API_BASE_URL }, () => {
    assert.throws(() => resolveApiBaseUrl(), /must not point at the Production API origin/);
  });
  withEnv({ EXPO_PUBLIC_APP_ENV: 'preview_internal_beta', EXPO_PUBLIC_API_BASE_URL: `${PRODUCTION_API_BASE_URL}/` }, () => {
    assert.throws(() => resolveApiBaseUrl(), /must not point at the Production API origin/);
  });
});

test('mobile preview_internal_beta uses an isolated, explicitly configured Preview API origin', () => {
  withEnv({ EXPO_PUBLIC_APP_ENV: 'preview_internal_beta', EXPO_PUBLIC_API_BASE_URL: 'https://yeki-hast-preview-internal-beta.vercel.app/' }, () => {
    assert.equal(resolveApiBaseUrl(), 'https://yeki-hast-preview-internal-beta.vercel.app');
  });
});

test('mobile production always resolves the canonical Production API origin', () => {
  withEnv({ EXPO_PUBLIC_APP_ENV: 'production' }, () => {
    assert.equal(resolveApiBaseUrl(), PRODUCTION_API_BASE_URL);
  });
});

test('mobile local falls back to localhost without ever reaching Production', () => {
  withEnv({}, () => assert.equal(resolveApiBaseUrl(), 'http://localhost:4000'));
  withEnv({ EXPO_PUBLIC_API_BASE_URL: 'http://localhost:5000/' }, () => assert.equal(resolveApiBaseUrl(), 'http://localhost:5000'));
});

test('isProductionOrigin compares hostnames only, ignoring scheme/path/trailing slash', () => {
  assert.equal(isProductionOrigin(PRODUCTION_API_BASE_URL, PRODUCTION_API_BASE_URL), true);
  assert.equal(isProductionOrigin(`${PRODUCTION_API_BASE_URL}/v1`, PRODUCTION_API_BASE_URL), true);
  assert.equal(isProductionOrigin('https://attacker.example', PRODUCTION_API_BASE_URL), false);
  assert.equal(isProductionOrigin('not a url', PRODUCTION_API_BASE_URL), false);
});
