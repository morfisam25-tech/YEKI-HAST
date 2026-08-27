import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dispatch = await readFile(new URL('../services/api/src/routes/call-dispatch.ts', import.meta.url), 'utf8');
const provider = await readFile(new URL('../services/api/src/providers/telephony.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const mobile = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');

test('call dispatch requires authenticated ownership and only retries the same pre-connect claim', () => {
  assert.match(dispatch, /const \{ userId \} = await requireAuth\(req\)/);
  assert.match(dispatch, /WHERE id=\$1 AND caller_user_id=\$2/);
  assert.match(dispatch, /row\.status !== 'routing' && row\.status !== 'calling_caller'/);
  assert.match(dispatch, /if \(row\.status === 'routing'\)/);
});

test('call dispatch only uses verified encrypted contact records', () => {
  assert.match(dispatch, /private_data\.user_contacts/);
  assert.match(dispatch, /phone_verified_at/);
  assert.match(dispatch, /decryptPrivateText/);
  assert.doesNotMatch(dispatch, /console\.log/);
});

test('telephony adapter contract is idempotent by application call session', () => {
  assert.match(provider, /MUST return the same logical bridge/);
  assert.match(provider, /Must be idempotent by input\.callSessionId/);
  assert.match(provider, /`dev-\$\{input\.callSessionId\}`/);
  assert.match(dispatch, /callSessionId: claimed\.callId/);
});

test('call dispatch persists provider bridge id and terminates orphan bridge on persistence race', () => {
  assert.match(dispatch, /provider_bridge_id=\$2/);
  assert.match(dispatch, /terminateCall\(bridgeId, 'dispatch_state_conflict'\)/);
});

test('ambiguous provider result preserves reservation and non-terminal state for safe retry', () => {
  assert.match(dispatch, /dispatch_result_uncertain/);
  assert.match(dispatch, /throw new HttpError\(503, 'telephony_dispatch_uncertain'\)/);
  const catchStart = dispatch.indexOf('} catch {', dispatch.indexOf('createBridgeCall'));
  const persistStart = dispatch.indexOf('const persisted = await query', catchStart);
  assert.ok(catchStart >= 0 && persistStart > catchStart);
  const ambiguousSection = dispatch.slice(catchStart, persistStart);
  assert.doesNotMatch(ambiguousSection, /status='failed'/);
  assert.doesNotMatch(ambiguousSection, /reserved_minor=reserved_minor-/);
});

test('dispatch endpoint is wired and mobile client exposes caller lifecycle APIs', () => {
  assert.match(handler, /const dispatchMatch = url\.pathname\.match\(\/\^\\\/v1\\\/calls\\\/\(\[\^\/\]\+\)\\\/dispatch\$\/\)/);
  assert.match(handler, /dispatchCall/);
  assert.match(mobile, /export function requestCall/);
  assert.match(mobile, /export function dispatchCall/);
  assert.match(mobile, /export function getCall/);
  assert.match(mobile, /export function cancelCall/);
  assert.match(mobile, /export function safetyExitCall/);
});
