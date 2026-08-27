import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../apps/admin/app/readiness/page.tsx', import.meta.url), 'utf8');
const backend = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');

test('admin readiness UI surfaces aggregate Caller launch verdict', () => {
  assert.match(page, /callerLaunch\.ready/);
  assert.match(page, /READY TO OPEN/);
  assert.match(page, /callerClosedBeta\.enabled/);
  assert.match(page, /BETA ENABLED/);
  assert.match(page, /BETA DISABLED/);
});

test('Caller launch readiness remains fail-closed on every required dependency', () => {
  assert.match(backend, /const callerLaunchReady = callerClosedBetaEnabled/);
  assert.match(backend, /&& callerAgePolicyReady/);
  assert.match(backend, /&& smsReady/);
  assert.match(backend, /&& paymentReady/);
  assert.match(backend, /&& telephonyReady/);
});

test('readiness UI does not expose credentials or secret values', () => {
  assert.doesNotMatch(page, /apiKey|secretKey|password|credential/i);
  assert.match(backend, /secretsIncluded: false/);
});
