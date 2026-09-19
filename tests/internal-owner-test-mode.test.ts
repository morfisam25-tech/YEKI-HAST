import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  INTERNAL_OWNER_TEST_LISTENER_ID,
  isInternalOwnerTestMode,
  requireInternalOwnerTestAuthorization,
  __resetInternalBetaRuntimeCacheForTests,
} from '../services/api/src/lib/internal-owner-test.ts';
import { HttpError } from '../services/api/src/lib/http.ts';

const VALID_OWNER_TOKEN = 'w25-owner-test-token-0123456789abcdef0123456789';
const INTERNAL_LOCAL_DB = 'postgresql://internal:internal@localhost:5432/yeki_hast_internal_beta';
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

function withEnv(values: Record<string,string|undefined>, run: () => void) {
  const keys = [...new Set([...MANAGED_ENV, ...Object.keys(values)])];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  __resetInternalBetaRuntimeCacheForTests();
  try {
    for (const key of keys) delete process.env[key];
    for (const [key,value] of Object.entries(values)) {
      if (value !== undefined) process.env[key]=value;
    }
    run();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key]; else process.env[key]=value;
    }
    __resetInternalBetaRuntimeCacheForTests();
  }
}

function errorCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof HttpError);
    return error.code;
  }
  assert.fail('expected HttpError');
}

function requestWithOwnerToken(value?: string): IncomingMessage {
  return { headers: value ? { 'x-internal-beta-owner-test-token': value } : {} } as IncomingMessage;
}

function gitBlobSha(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

test('production always blocks owner test mode even when every test flag and secret is set', () => {
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_ENVIRONMENT:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    VERCEL_ENV:'production',
    NODE_ENV:'production',
    DATABASE_URL:'postgresql://production:production@prod.example.invalid:5432/yeki_hast',
  }, () => {
    const before = process.env.DATABASE_URL;
    assert.equal(isInternalOwnerTestMode(), false);
    assert.equal(process.env.DATABASE_URL, before);
  });
});

test('owner test mode is explicit and limited to preview/development/internal beta', () => {
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => {
    assert.equal(isInternalOwnerTestMode(), true);
    assert.equal(process.env.DATABASE_URL, INTERNAL_LOCAL_DB);
  });
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    NODE_ENV:'test',
  }, () => assert.equal(isInternalOwnerTestMode(), false));
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_ENVIRONMENT:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    NODE_ENV:'test',
  }, () => assert.equal(isInternalOwnerTestMode(), true));
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:undefined,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => assert.equal(isInternalOwnerTestMode(), false));
});

test('owner test mode fails closed without the dedicated internal database', () => {
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
    DATABASE_URL:'postgresql://normal:normal@prod.example.invalid:5432/yeki_hast',
  }, () => {
    assert.equal(errorCode(() => isInternalOwnerTestMode()), 'internal_beta_database_url_required');
  });
});

test('owner test mode fails closed without a strong owner authorization token', () => {
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => {
    assert.equal(errorCode(() => isInternalOwnerTestMode()), 'internal_beta_owner_test_auth_required');
  });
});

test('owner test authorization rejects missing/wrong token and accepts valid token only in allowed mode', () => {
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => {
    assert.equal(errorCode(() => requireInternalOwnerTestAuthorization(requestWithOwnerToken())), 'internal_test_unauthorized');
    assert.equal(errorCode(() => requireInternalOwnerTestAuthorization(requestWithOwnerToken(`${VALID_OWNER_TOKEN}-wrong`))), 'internal_test_unauthorized');
    assert.doesNotThrow(() => requireInternalOwnerTestAuthorization(requestWithOwnerToken(VALID_OWNER_TOKEN)));
  });
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    VERCEL_ENV:'production',
    NODE_ENV:'production',
  }, () => {
    assert.equal(errorCode(() => requireInternalOwnerTestAuthorization(requestWithOwnerToken(VALID_OWNER_TOKEN))), 'not_found');
  });
});

test('internal beta never falls back to a normal/production database and rejects obvious equality', () => {
  const remote = 'postgresql://same:same@db.example.invalid:5432/yeki_hast';
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:remote,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    DATABASE_URL:remote,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => assert.equal(errorCode(() => isInternalOwnerTestMode()), 'internal_beta_database_must_be_isolated'));
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:remote,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    PRODUCTION_DATABASE_URL:remote,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => assert.equal(errorCode(() => isInternalOwnerTestMode()), 'internal_beta_database_must_be_isolated'));
});

test('repeated isInternalOwnerTestMode calls stay bound to the isolated database instead of rejecting their own prior rebind', () => {
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => {
    assert.equal(isInternalOwnerTestMode(), true);
    assert.equal(process.env.DATABASE_URL, INTERNAL_LOCAL_DB);
    assert.equal(isInternalOwnerTestMode(), true);
    assert.equal(process.env.DATABASE_URL, INTERNAL_LOCAL_DB);
    assert.equal(isInternalOwnerTestMode(), true);
    assert.equal(process.env.DATABASE_URL, INTERNAL_LOCAL_DB);
  });
});

test('synthetic session path is bound to isolated database and production auth does not accept token format alone', async () => {
  withEnv({
    INTERNAL_BETA_OWNER_TEST_MODE:'1',
    INTERNAL_BETA_DATABASE_URL:INTERNAL_LOCAL_DB,
    INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN:VALID_OWNER_TOKEN,
    VERCEL_ENV:'preview',
    NODE_ENV:'production',
  }, () => {
    assert.equal(isInternalOwnerTestMode(), true);
    assert.equal(process.env.DATABASE_URL, INTERNAL_LOCAL_DB);
  });

  const ownerRoute = await readFile(new URL('../services/api/src/routes/internal-owner-test.ts', import.meta.url), 'utf8');
  const authSource = await readFile(new URL('../services/api/src/lib/auth.ts', import.meta.url), 'utf8');
  const envSource = await readFile(new URL('../services/api/src/lib/env.ts', import.meta.url), 'utf8');
  assert.match(ownerRoute, /INSERT INTO private_data\.auth_sessions/);
  assert.match(ownerRoute, /requireInternalOwnerTestAuthorization\(req\)/);
  assert.match(envSource, /isInternalOwnerTestMode\(\);[\s\S]*requireValue\('DATABASE_URL'\)/);
  assert.match(authSource, /WHERE s\.token_hash=\$1/);
  assert.match(authSource, /tokenHash\(raw\)/);
  assert.doesNotMatch(authSource, /INTERNAL_OWNER_TEST/);
});

test('synthetic listener stays distinguishable and normal gates remain in source', async () => {
  assert.equal(INTERNAL_OWNER_TEST_LISTENER_ID, '00000000-0000-4000-8000-000000000141');
  const source = await readFile(new URL('../services/api/src/routes/internal-owner-test.ts', import.meta.url), 'utf8');
  assert.match(source, /INTERNAL TEST DATA/);
  assert.match(source, /VALUES \(\$1,'شنونده تست مالک','female',false,100\)/);
  assert.match(source, /is_public\)\n\s*VALUES \(\$1,\$2,[\s\S]*false\)/);
  assert.doesNotMatch(source, /listener_kyc/);
});

test('production-facing eligibility exceptions require both runtime guard and synthetic UUID', async () => {
  const marketplace = await readFile(new URL('../services/api/src/routes/marketplace.ts', import.meta.url), 'utf8');
  const request = await readFile(new URL('../services/api/src/routes/caller-call-request.ts', import.meta.url), 'utf8');
  for (const source of [marketplace,request]) {
    assert.match(source, /isInternalOwnerTestCaller\(userId\)/);
    assert.match(source, /INTERNAL_OWNER_TEST_LISTENER_ID/);
  }
});

test('bootstrap checks the production guard before touching database readiness', async () => {
  const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
  const line = handler.split('\n').find((item) => item.includes("/v1/internal-beta/owner-test/bootstrap")) ?? '';
  assert.ok(line.indexOf('requireInternalOwnerTestMode()') < line.indexOf('ensureDatabaseReady()'));
});

test('owner test workflows cannot copy Production env and preview env contract is allow-listed', async () => {
  const workflowsDir = new URL('../.github/workflows/', import.meta.url);
  const names = (await readdir(workflowsDir)).filter((name) => name.includes('owner-test'));
  assert.ok(names.length > 0);
  for (const name of names) {
    const source = await readFile(new URL(name, workflowsDir), 'utf8');
    assert.doesNotMatch(source, /PRODUCTION_DATABASE_URL/);
    assert.doesNotMatch(source, /vercel\s+pull\s+--environment(?:=|\s+)production/i);
    assert.doesNotMatch(source, /INTERNAL_BETA_RUNTIME_ENV_B64/);
    assert.doesNotMatch(source, /\bbase64\b/i);
  }

  const allowlist = await readFile(new URL('../.github/internal-beta-preview.env.allowlist', import.meta.url), 'utf8');
  const namesOnly = allowlist.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert.deepEqual(namesOnly, [
    'INTERNAL_BETA_OWNER_TEST_MODE',
    'INTERNAL_BETA_DATABASE_URL',
    'INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN',
  ]);
});

test('legacy production-runtime hydration path is removed', async () => {
  const source = await readFile(new URL('../services/api/src/lib/internal-owner-test.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /INTERNAL_BETA_RUNTIME_ENV_B64/);
  assert.doesNotMatch(source, /Buffer\.from\([^)]*base64/);
  assert.match(source, /process\.env\.DATABASE_URL = dedicated\.raw/);
});

test('Home freeze blobs remain exact', async () => {
  // Baseline updated for the W9-approved diaspora poem reel (commit 0e09f1a); these are
  // that commit's own page.tsx/home.module.css blob hashes, not a new Home change.
  const page = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url));
  const css = await readFile(new URL('../apps/web/app/home.module.css', import.meta.url));
  assert.equal(gitBlobSha(page), 'a4e72b963207178ea417a602fb733c411cbadec8');
  assert.equal(gitBlobSha(css), 'f99666c5899346084c47a58b9371be20582f3942');
});
