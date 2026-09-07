import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const listenerCalls = await readFile(new URL('../services/api/src/routes/listener-calls.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const caller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const listener = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');

const exactTerminationReasons = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

test('caller and listener active-call reads derive fallback termination state only from exact durable markers', () => {
  for (const source of [calls, listenerCalls]) {
    assert.match(source, /AS termination_in_progress/);
    assert.match(source, /ce\.metadata->>'reason' = ANY\(\$3::text\[\]\)/);
    assert.doesNotMatch(source, /ce\.metadata->>'reason' LIKE/);
    for (const reason of exactTerminationReasons) assert.match(source, new RegExp(reason));
    assert.match(source, /terminationInProgress: row\.termination_in_progress/);
  }
  assert.equal((calls.match(/ce\.metadata->>'reason' = ANY\(\$3::text\[\]\)/g) ?? []).length, 2);
  assert.equal((listenerCalls.match(/ce\.metadata->>'reason' = ANY\(\$3::text\[\]\)/g) ?? []).length, 1);
});

test('participant mobile contract exposes transport plus only a boolean fallback termination signal', () => {
  assert.match(api, /terminationInProgress: boolean/);
  assert.match(api, /terminationInProgress\?: boolean/);
  assert.match(api, /transport/);
  assert.doesNotMatch(api, /terminationReason|terminationState|providerBridgeId/);
});

test('caller primary Internet Voice uses its own idempotent end routes instead of PSTN termination state', () => {
  assert.match(caller, /endInternetVoiceCall\(token, call\.callId\)/);
  assert.match(caller, /safetyExitInternetVoiceCall\(token, call\.callId\)/);
  assert.doesNotMatch(caller, /dispatchCall\(/);
});

test('listener preserves fallback termination lock while Internet Voice uses transport-specific end routes', () => {
  assert.match(listener, /activeCall\.terminationInProgress/);
  assert.match(listener, /terminationInProgress: true/);
  assert.match(listener, /safetyExitInternetVoiceCall\(token, activeCall\.callId\)/);
  assert.match(listener, /safetyExitCall\(token, activeCall\.callId\)/);
  assert.match(listener, /کنترل پایان دوباره ارسال نمی‌شود/);
});
