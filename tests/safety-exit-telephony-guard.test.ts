import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');

test('safety exit carries bridge id only inside the server operation', () => {
  assert.match(source, /provider_bridge_id/);
  assert.match(source, /providerBridgeId: call\.provider_bridge_id/);
  assert.match(source, /providerBridgeId: _privateBridgeId/);
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
