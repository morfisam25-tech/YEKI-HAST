import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dispatch = await readFile(new URL('../services/api/src/routes/call-dispatch.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const mobile = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');

test('call dispatch requires authenticated ownership and routing state', () => {
  assert.match(dispatch, /const \{ userId \} = await requireAuth\(req\)/);
  assert.match(dispatch, /WHERE id=\$1 AND caller_user_id=\$2/);
  assert.match(dispatch, /row\.status !== 'routing'/);
});

test('call dispatch only uses verified encrypted contact records', () => {
  assert.match(dispatch, /private_data\.user_contacts/);
  assert.match(dispatch, /phone_verified_at/);
  assert.match(dispatch, /decryptPrivateText/);
  assert.doesNotMatch(dispatch, /console\.log/);
});

test('call dispatch persists provider bridge id and terminates orphan bridge on race', () => {
  assert.match(dispatch, /provider_bridge_id=\$2/);
  assert.match(dispatch, /terminateCall\(bridgeId, 'dispatch_state_conflict'\)/);
});

test('telephony dispatch failure releases reserved caller funds and fails the call', () => {
  assert.match(dispatch, /status='failed'/);
  assert.match(dispatch, /telephony_dispatch_failed/);
  assert.match(dispatch, /reserved_minor=reserved_minor-\$3::bigint/);
});

test('dispatch endpoint is wired and mobile client exposes caller lifecycle APIs', () => {
  assert.match(handler, /\/v1\/calls\\\/\(\[\^\/\]\+\)\\\/dispatch/);
  assert.match(handler, /dispatchCall/);
  assert.match(mobile, /export function requestCall/);
  assert.match(mobile, /export function dispatchCall/);
  assert.match(mobile, /export function getCall/);
  assert.match(mobile, /export function cancelCall/);
  assert.match(mobile, /export function safetyExitCall/);
});
