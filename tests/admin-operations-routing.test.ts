import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../apps/admin/app/api/ops/[...path]/route.ts', import.meta.url), 'utf8');

test('admin operations routes stay wired in the API handler', () => {
  assert.match(handler, /\/v1\/admin\/payouts/);
  assert.match(handler, /\/v1\/admin\/payment-attempts/);
  assert.match(handler, /\/v1\/admin\/safety-cases/);
  assert.match(handler, /\/v1\/admin\/calls/);
  assert.match(handler, /listAdminPayouts/);
  assert.match(handler, /listAdminPaymentAttempts/);
  assert.match(handler, /listAdminSafetyCases/);
  assert.match(handler, /listAdminCalls/);
  assert.match(handler, /adminSafetyActionMatch/);
  assert.match(handler, /actOnAdminSafetyCase/);
});

test('admin proxy remains restricted to admin namespace', () => {
  assert.match(proxy, /\/v1\/admin\//);
  assert.doesNotMatch(proxy, /\/v1\/wallet/);
  assert.doesNotMatch(proxy, /\/v1\/listener\/presence/);
});
