import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');

test('safety exit carries bridge id only inside the server operation', () => {
  assert.match(source, /provider_bridge_id/);
  assert.match(source, /providerBridgeId: call\.provider_bridge_id/);
  assert.match(source, /providerBridgeId: _privateBridgeId/);
  const response = source.slice(source.lastIndexOf('sendJson(res, 200'));
  assert.doesNotMatch(response, /providerBridgeId|provider_bridge_id/);
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

test('provider termination is durably started before the external side effect', () => {
  const started = source.indexOf("'reason','safety_termination_started'");
  const terminate = source.indexOf('await preparation.telephony.terminateCall');
  assert.ok(started >= 0 && terminate > started);
});

test('ambiguous safety termination does not release funds or mark the call terminal', () => {
  const terminate = source.indexOf('await preparation.telephony.terminateCall');
  const catchIndex = source.indexOf('} catch {', terminate);
  const pending = source.indexOf("throw new HttpError(502, 'telephony_termination_pending')", catchIndex);
  assert.ok(terminate >= 0 && catchIndex > terminate && pending > catchIndex);
  const branch = source.slice(catchIndex, pending + 80);
  assert.match(branch, /safety_termination_result_uncertain/);
  assert.doesNotMatch(branch, /reserved_minor=reserved_minor-/);
  assert.doesNotMatch(branch, /SET status='safety_terminated'/);
});

test('started or uncertain safety termination blocks blind provider retry', () => {
  assert.match(source, /event\.reason === 'safety_termination_result_uncertain' \|\| event\.reason === 'safety_termination_started'/);
  const unresolved = source.indexOf('if (unresolved)');
  const terminate = source.indexOf('await preparation.telephony.terminateCall', unresolved);
  assert.ok(unresolved >= 0 && terminate > unresolved);
  const branch = source.slice(unresolved, source.indexOf('let telephony:', unresolved));
  assert.match(branch, /kind: 'reconcile_required'/);
  assert.doesNotMatch(branch, /terminateCall/);
});

test('confirmed safety termination is required before financial and terminal finalization', () => {
  const confirmCheck = source.indexOf("metadata->>'reason'='safety_termination_confirmed'");
  const release = source.indexOf('reserved_minor=reserved_minor-$3::bigint', confirmCheck);
  const terminal = source.indexOf("SET status='safety_terminated'", release);
  assert.ok(confirmCheck >= 0 && release > confirmCheck && terminal > release);
});

test('idempotent safety terminal retry never re-enters provider termination', () => {
  const terminalBranch = source.slice(
    source.indexOf("if (call.status === 'safety_terminated')"),
    source.indexOf("if (!liveStatuses.has(call.status))"),
  );
  assert.match(terminalBranch, /idempotent: true/);
  assert.doesNotMatch(terminalBranch, /terminateCall/);
});

test('safety exit never logs provider bridge ids or private details', () => {
  assert.doesNotMatch(source, /console\.error\([^\n]*providerBridgeId/);
  assert.doesNotMatch(source, /console\.log/);
});
