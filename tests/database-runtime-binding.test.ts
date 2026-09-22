import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { closePool, getPool } from '../packages/db/src/client.ts';
import {
  __resetInternalBetaRuntimeCacheForTests,
  isInternalOwnerTestMode,
} from '../services/api/src/lib/internal-owner-test.ts';

const NORMAL_LOCAL_DB = 'postgresql://normal:normal@localhost:5432/normal_preview';
const INTERNAL_LOCAL_DB = 'postgresql://internal:internal@localhost:5432/w88_isolated';
const VALID_OWNER_TOKEN = 'w25-owner-test-token-0123456789abcdef0123456789';
const MANAGED_ENV = [
  'DATABASE_URL',
  'PRODUCTION_DATABASE_URL',
  'INTERNAL_BETA_DATABASE_URL',
  'INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN',
  'INTERNAL_BETA_OWNER_TEST_MODE',
  'INTERNAL_BETA_ENVIRONMENT',
  'VERCEL_ENV',
  'NODE_ENV',
] as const;

async function withOwnerTestEnv(run: () => void | Promise<void>): Promise<void> {
  const previous = Object.fromEntries(MANAGED_ENV.map((key) => [key, process.env[key]]));
  await closePool();
  __resetInternalBetaRuntimeCacheForTests();
  try {
    for (const key of MANAGED_ENV) delete process.env[key];
    Object.assign(process.env, {
      DATABASE_URL: NORMAL_LOCAL_DB,
      INTERNAL_BETA_DATABASE_URL: INTERNAL_LOCAL_DB,
      INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN: VALID_OWNER_TOKEN,
      INTERNAL_BETA_OWNER_TEST_MODE: '1',
      VERCEL_ENV: 'preview',
      NODE_ENV: 'production',
    });
    await run();
  } finally {
    await closePool();
    for (const key of MANAGED_ENV) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetInternalBetaRuntimeCacheForTests();
  }
}

function poolDatabasePath(): string {
  const connectionString = (getPool().options as { connectionString?: string }).connectionString;
  assert.ok(connectionString);
  return new URL(connectionString).pathname;
}

test('owner-test initialization before the first DB operation creates the pool for the isolated database', async () => {
  await withOwnerTestEnv(() => {
    assert.equal(isInternalOwnerTestMode(), true);
    assert.equal(poolDatabasePath(), '/w88_isolated');
  });
});

test('a late DATABASE_URL rebind fails closed instead of reusing or silently replacing an existing pool', async () => {
  await withOwnerTestEnv(() => {
    assert.equal(poolDatabasePath(), '/normal_preview');
    assert.equal(isInternalOwnerTestMode(), true);
    assert.throws(() => getPool(), /DATABASE_URL changed after pool initialization/);
  });
});

test('cold Vercel email auth initializes owner-test isolation before loading DB-backed routes', async () => {
  const runtime = await readFile(new URL('../api/runtime.ts', import.meta.url), 'utf8');
  const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
  const initializeAt = runtime.indexOf('isInternalOwnerTestMode();');
  const routeImportAt = runtime.indexOf("await import('../services/api/src/handler.ts')");

  assert.ok(initializeAt >= 0);
  assert.ok(routeImportAt > initializeAt);
  assert.doesNotMatch(runtime, /import \{ handleApiRequest \} from/);
  assert.match(handler, /\/v1\/auth\/email\/request[^\n]+ensureEmailAuthReady/);
  assert.match(handler, /\/v1\/auth\/email\/verify[^\n]+ensureEmailAuthReady/);
});
