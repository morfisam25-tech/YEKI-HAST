import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dispatch = await readFile(new URL('../services/api/src/routes/call-dispatch.ts', import.meta.url), 'utf8');
const mobile = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');

test('telephony provider availability is checked before routing is claimed as calling_caller', () => {
  const preflight = dispatch.indexOf('telephony = getTelephonyProvider()');
  const claim = dispatch.indexOf("SET status='calling_caller'");
  assert.ok(preflight >= 0 && claim > preflight);
  const beforeClaim = dispatch.slice(preflight, claim);
  assert.match(beforeClaim, /telephony_not_configured/);
  assert.doesNotMatch(beforeClaim, /createBridgeCall/);
});

test('provider configuration failure leaves the call retryable/cancellable in routing', () => {
  assert.match(dispatch, /throw new HttpError\(503, 'telephony_not_configured'\)/);
  const configCatch = dispatch.slice(
    dispatch.indexOf('telephony = getTelephonyProvider()'),
    dispatch.indexOf('const contacts = await client.query'),
  );
  assert.doesNotMatch(configCatch, /dispatch_result_uncertain/);
  assert.doesNotMatch(configCatch, /status='calling_caller'/);
  assert.doesNotMatch(configCatch, /reserved_minor=reserved_minor-/);
  assert.match(mobile, /telephony_not_configured:/);
  assert.match(mobile, /call && call\.status === 'routing'/);
});

test('only actual createBridgeCall failure enters dispatch ambiguity handling', () => {
  const submit = dispatch.indexOf('createBridgeCall');
  const ambiguousCatch = dispatch.indexOf('} catch {', submit);
  const ambiguousEvent = dispatch.indexOf('dispatch_result_uncertain', ambiguousCatch);
  assert.ok(submit >= 0 && ambiguousCatch > submit && ambiguousEvent > ambiguousCatch);
  assert.match(dispatch.slice(ambiguousCatch, ambiguousEvent + 100), /telephony/);
});

test('the same preflighted provider instance handles submission and orphan termination', () => {
  assert.match(dispatch, /claimed\.telephony\.createBridgeCall/);
  assert.match(dispatch, /claimed\.telephony\.terminateCall\(bridgeId, 'dispatch_state_conflict'\)/);
});
