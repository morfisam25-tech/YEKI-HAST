import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  INTERNAL_OWNER_TEST_LISTENER_ID,
  isInternalOwnerTestMode,
} from '../services/api/src/lib/internal-owner-test.ts';

function withEnv(values: Record<string,string|undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key,value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key]=value;
    }
    run();
  } finally {
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
}

test('production always blocks owner test mode even when every test flag is set', () => {
  withEnv({INTERNAL_BETA_OWNER_TEST_MODE:'1',INTERNAL_BETA_ENVIRONMENT:'1',VERCEL_ENV:'production',NODE_ENV:'production'}, () => {
    assert.equal(isInternalOwnerTestMode(), false);
  });
});

test('owner test mode is explicit and limited to preview/development/internal beta', () => {
  withEnv({INTERNAL_BETA_OWNER_TEST_MODE:'1',VERCEL_ENV:'preview',NODE_ENV:'production'}, () => assert.equal(isInternalOwnerTestMode(), true));
  withEnv({INTERNAL_BETA_OWNER_TEST_MODE:undefined,VERCEL_ENV:'preview',NODE_ENV:'production'}, () => assert.equal(isInternalOwnerTestMode(), false));
});

test('synthetic listener stays distinguishable and normal gates remain in source', async () => {
  assert.equal(INTERNAL_OWNER_TEST_LISTENER_ID, '00000000-0000-4000-8000-000000000141');
  const source = await readFile(new URL('../services/api/src/routes/internal-owner-test.ts', import.meta.url), 'utf8');
  assert.match(source, /INTERNAL TEST DATA/);
  assert.match(source, /VALUES \(\$1,'شنونده تست مالک','female',false,100\)/);
  assert.match(source, /is_public\)\n\+?\s*VALUES \(\$1,\$2,[\s\S]*false\)/);
  assert.doesNotMatch(source, /listener_kyc/);
});

test('production-facing eligibility exceptions require both the runtime guard and synthetic UUID', async () => {
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
