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

test('cancellation cannot release reservation while dispatch result is unresolved', () => {
  const uncertainIndex = source.indexOf("row.status === 'calling_caller' && !row.provider_bridge_id");
  const releaseIndex = source.indexOf('reserved_minor=reserved_minor-$3::bigint', uncertainIndex);
  assert.ok(uncertainIndex >= 0 && releaseIndex > uncertainIndex);
  assert.match(source, /throw new HttpError\(409, 'telephony_dispatch_uncertain'\)/);
  assert.match(source, /\(row\.status === 'caller_answered' \|\| row\.status === 'calling_listener'\) && !row\.provider_bridge_id/);
  assert.match(source, /throw new HttpError\(409, 'call_telephony_invariant'\)/);
});

test('idempotent cancellation retries bridge termination without charging again', () => {
  assert.match(source, /row\.status === 'cancelled'/);
  assert.match(source, /idempotent: true, providerBridgeId: row\.provider_bridge_id/);
  assert.match(source, /reserved_minor=reserved_minor-\$3::bigint/);
});
