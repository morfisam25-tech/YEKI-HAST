import assert from 'node:assert/strict';
import test from 'node:test';
import { backendBaseUrl as webBackendBaseUrl } from '../apps/web/app/api/_backend.ts';
import { backendBaseUrl as adminBackendBaseUrl } from '../apps/admin/app/api/_backend.ts';
import { resolveAppEnv as resolveWebAppEnv } from '../apps/web/app/api/_env.ts';
import { resolveAppEnv as resolveAdminAppEnv } from '../apps/admin/app/api/_env.ts';

const MANAGED_ENV = ['APP_ENV', 'VERCEL_ENV', 'WEB_API_BASE_URL', 'ADMIN_API_BASE_URL'] as const;

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

for (const [name, resolveAppEnv] of [
  ['web', resolveWebAppEnv],
  ['admin', resolveAdminAppEnv],
] as const) {
  test(`${name} resolveAppEnv derives identity from VERCEL_ENV, never NODE_ENV, when APP_ENV is unset`, () => {
    withEnv({ VERCEL_ENV: 'production' }, () => assert.equal(resolveAppEnv(), 'production'));
    withEnv({ VERCEL_ENV: 'preview' }, () => assert.equal(resolveAppEnv(), 'preview_internal_beta'));
    withEnv({ VERCEL_ENV: 'development' }, () => assert.equal(resolveAppEnv(), 'local'));
    withEnv({}, () => assert.equal(resolveAppEnv(), 'local'));
  });

  test(`${name} resolveAppEnv honors an explicit APP_ENV override`, () => {
    withEnv({ APP_ENV: 'production', VERCEL_ENV: 'preview' }, () => assert.equal(resolveAppEnv(), 'production'));
    withEnv({ APP_ENV: 'preview_internal_beta', VERCEL_ENV: 'production' }, () => assert.equal(resolveAppEnv(), 'preview_internal_beta'));
    withEnv({ APP_ENV: 'local' }, () => assert.equal(resolveAppEnv(), 'local'));
  });

  test(`${name} resolveAppEnv fails closed on an unrecognized APP_ENV value`, () => {
    withEnv({ APP_ENV: 'staging' }, () => assert.throws(() => resolveAppEnv(), /APP_ENV has an unrecognized value/));
  });
}

for (const [name, backendBaseUrl, envName] of [
  ['web', webBackendBaseUrl, 'WEB_API_BASE_URL'],
  ['admin', adminBackendBaseUrl, 'ADMIN_API_BASE_URL'],
] as const) {
  test(`${name} preview_internal_beta with a missing Preview API URL fails closed and never falls back to Production`, () => {
    withEnv({ VERCEL_ENV: 'preview' }, () => {
      assert.throws(() => backendBaseUrl(), /required in preview_internal_beta/);
    });
    withEnv({ APP_ENV: 'preview_internal_beta' }, () => {
      assert.throws(() => backendBaseUrl(), /required in preview_internal_beta/);
    });
  });

  test(`${name} preview_internal_beta rejects a Preview API URL that points at the Production origin`, () => {
    withEnv({ VERCEL_ENV: 'preview', [envName]: 'https://yeki-hast-unique-6ff0.vercel.app' }, () => {
      assert.throws(() => backendBaseUrl(), /must not point at the Production API origin/);
    });
    withEnv({ VERCEL_ENV: 'preview', [envName]: 'https://yeki-hast-unique-6ff0.vercel.app/' }, () => {
      assert.throws(() => backendBaseUrl(), /must not point at the Production API origin/);
    });
  });

  test(`${name} preview_internal_beta uses an isolated, explicitly configured Preview API origin`, () => {
    withEnv({ VERCEL_ENV: 'preview', [envName]: 'https://yeki-hast-preview-internal-beta.vercel.app/' }, () => {
      assert.equal(backendBaseUrl(), 'https://yeki-hast-preview-internal-beta.vercel.app');
    });
  });

  test(`${name} production always resolves the canonical Production API origin regardless of overrides`, () => {
    withEnv({ VERCEL_ENV: 'production', [envName]: 'https://attacker.example' }, () => {
      assert.equal(backendBaseUrl(), 'https://yeki-hast-unique-6ff0.vercel.app');
    });
    withEnv({ APP_ENV: 'production', [envName]: 'https://attacker.example' }, () => {
      assert.equal(backendBaseUrl(), 'https://yeki-hast-unique-6ff0.vercel.app');
    });
  });

  test(`${name} local falls back to localhost without ever reaching Production`, () => {
    withEnv({}, () => assert.equal(backendBaseUrl(), 'http://localhost:4000'));
    withEnv({ [envName]: 'http://localhost:5000/' }, () => assert.equal(backendBaseUrl(), 'http://localhost:5000'));
  });
}
