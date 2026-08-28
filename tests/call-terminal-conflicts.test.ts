import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const safety = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');
const callerMobile = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const listenerMobile = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');

test('caller cancel remains limited to pre-connect states and cannot mutate connected or terminal calls', () => {
  assert.match(calls, /\['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener'\]\.includes\(row\.status\)/);
  assert.match(calls, /throw new HttpError\(409, 'call_cannot_be_cancelled'\)/);
  assert.doesNotMatch(calls, /\['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'\]\.includes\(row\.status\)/);
});

test('safety exit accepts only live states plus its own idempotent terminal state', () => {
  assert.match(safety, /const liveStatuses = new Set\(\[\.\.\.preConnectedStatuses, 'connected'\]\)/);
  assert.match(safety, /if \(call\.status === 'safety_terminated'\)/);
  assert.match(safety, /if \(!liveStatuses\.has\(call\.status\)\) throw new HttpError\(409, 'call_not_live'\)/);
});

test('cancel and safety terminal conflict paths cannot release the same reservation twice', () => {
  assert.match(calls, /if \(row\.status === 'cancelled'\)[\s\S]*idempotent: true/);
  assert.match(safety, /if \(call\.status === 'safety_terminated'\)[\s\S]*idempotent: true/);
});

test('cancel refuses to submit provider termination after safety termination has started', () => {
  const cancelStart = calls.indexOf('export async function cancelCall');
  const providerSubmit = calls.indexOf("kind: 'provider_submit'", cancelStart);
  const section = calls.slice(cancelStart, providerSubmit);
  for (const reason of [
    'safety_termination_started',
    'safety_termination_result_uncertain',
    'safety_termination_confirmed',
  ]) {
    assert.ok(section.includes(reason));
  }
  assert.match(section, /call_termination_in_progress/);
});

test('safety exit refuses to submit provider termination after caller cancel has started', () => {
  for (const reason of [
    'cancel_termination_started',
    'cancel_termination_result_uncertain',
    'cancel_termination_confirmed',
  ]) {
    assert.ok(safety.includes(reason));
  }
  assert.match(safety, /const cancelTerminationReasons = \[/);

  const safetyStart = safety.indexOf('export async function safetyExitCall');
  const providerSubmit = safety.indexOf("kind: 'provider_submit'", safetyStart);
  assert.ok(safetyStart >= 0 && providerSubmit > safetyStart);
  const section = safety.slice(safetyStart, providerSubmit);
  assert.match(section, /cancelTerminationReasons/);
  assert.match(section, /call_termination_in_progress/);
});

test('mobile clients explain competing termination without encouraging another end request', () => {
  assert.match(callerMobile, /call_termination_in_progress/);
  assert.match(callerMobile, /عملیات پایان دیگری را شروع نکن/);
  assert.match(listenerMobile, /call_termination_in_progress/);
  assert.match(listenerMobile, /Safety Exit را دوباره ارسال نکن/);
});
