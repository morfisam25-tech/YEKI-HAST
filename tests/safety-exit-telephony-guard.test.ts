import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');

test('safety exit carries bridge id only inside the server operation', () => {
  assert.match(source, /provider_bridge_id/);
  assert.match(source, /providerBridgeId: call\.provider_bridge_id/);
  assert.match(source, /providerBridgeId: _privateBridgeId/);
});

test('safety exit refuses terminal mutation while dispatch bridge identity is unresolved', () => {
  const uncertainIndex = source.indexOf("call.status === 'calling_caller' && !call.provider_bridge_id");
  const safetyEventIndex = source.indexOf('INSERT INTO app.safety_events', uncertainIndex);
  const releaseIndex = source.indexOf('reserved_minor=reserved_minor-$3::bigint', uncertainIndex);
  assert.ok(uncertainIndex >= 0 && safetyEventIndex > uncertainIndex && releaseIndex > uncertainIndex);
  assert.match(source, /throw new HttpError\(409, 'telephony_dispatch_uncertain'\)/);
  assert.match(source, /call\.status === 'caller_answered' \|\| call\.status === 'calling_listener' \|\| call\.status === 'connected'/);
  assert.match(source, /throw new HttpError\(409, 'call_telephony_invariant'\)/);
});

test('safety exit terminates an external bridge and retries on idempotent requests', () => {
  assert.match(source, /getTelephonyProvider\(\)\.terminateCall/);
  assert.match(source, /call\.status === 'safety_terminated'/);
  assert.match(source, /providerBridgeId: call\.provider_bridge_id/);
  assert.match(source, /telephony_termination_pending/);
});

test('safety exit never logs provider bridge ids or private details', () => {
  assert.doesNotMatch(source, /console\.error\([^\n]*providerBridgeId/);
  assert.doesNotMatch(source, /console\.log/);
});
