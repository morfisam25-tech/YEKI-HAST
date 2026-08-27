import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('caller cancellation keeps provider bridge private', () => {
  assert.match(source, /provider_bridge_id/);
  assert.match(source, /providerBridgeId: _privateBridgeId/);
});

test('caller cancellation terminates an already-created bridge', () => {
  assert.match(source, /getTelephonyProvider\(\)\.terminateCall\(result\.providerBridgeId, 'caller_cancelled'\)/);
  assert.match(source, /telephony_termination_pending/);
});

test('idempotent cancellation retries bridge termination without charging again', () => {
  assert.match(source, /row\.status === 'cancelled'/);
  assert.match(source, /idempotent: true, providerBridgeId: row\.provider_bridge_id/);
  assert.match(source, /reserved_minor=reserved_minor-\$3::bigint/);
});
