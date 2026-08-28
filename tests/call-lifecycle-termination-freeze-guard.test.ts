import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const lifecycle = await readFile(new URL('../services/api/src/services/call-lifecycle.ts', import.meta.url), 'utf8');

const exactTerminationReasons = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

test('provider lifecycle uses exact durable termination markers', () => {
  assert.match(lifecycle, /async function hasTerminationIntent/);
  assert.match(lifecycle, /metadata->>'reason' = ANY\(\$2::text\[\]\)/);
  assert.doesNotMatch(lifecycle, /metadata->>'reason' LIKE/);
  for (const reason of exactTerminationReasons) assert.match(lifecycle, new RegExp(reason));
});

test('provider transitions stop advancing app lifecycle after termination intent', () => {
  assert.equal((lifecycle.match(/await hasTerminationIntent\(client, input\.callId\)/g) ?? []).length, 4);
  assert.equal((lifecycle.match(/throw new Error\('call_termination_in_progress'\)/g) ?? []).length, 4);

  const transitionStart = lifecycle.indexOf('async function transitionByProvider');
  const transitionUpdate = lifecycle.indexOf('SET status=$2::app.call_status', transitionStart);
  const transitionGuard = lifecycle.indexOf('await hasTerminationIntent(client, input.callId)', transitionStart);
  assert.ok(transitionStart >= 0 && transitionGuard > transitionStart && transitionUpdate > transitionGuard);

  const connectedStart = lifecycle.indexOf('export async function markCallConnectedByProvider');
  const connectedUpdate = lifecycle.indexOf("SET status='connected'", connectedStart);
  const connectedGuard = lifecycle.indexOf('await hasTerminationIntent(client, input.callId)', connectedStart);
  assert.ok(connectedStart >= 0 && connectedGuard > connectedStart && connectedUpdate > connectedGuard);

  const endStart = lifecycle.indexOf('export async function endUnconnectedCallByProvider');
  const releaseIndex = lifecycle.indexOf('SET reserved_minor=reserved_minor-', endStart);
  const endGuard = lifecycle.indexOf('await hasTerminationIntent(client, input.callId)', endStart);
  assert.ok(endStart >= 0 && endGuard > endStart && releaseIndex > endGuard);
});

test('normal connected settlement freezes after termination intent but safety settlement remains allowed', () => {
  assert.match(lifecycle, /if \(!safetyTerminated && await hasTerminationIntent\(client, input\.callId\)\) \{/);
  const settleStart = lifecycle.indexOf('export async function settleCallByProvider');
  const settlementGuard = lifecycle.indexOf('await hasTerminationIntent(client, input.callId)', settleStart);
  const walletMutation = lifecycle.indexOf('SET balance_minor=balance_minor-', settleStart);
  assert.ok(settleStart >= 0 && settlementGuard > settleStart && walletMutation > settlementGuard);
  assert.match(lifecycle, /const finalStatus = safetyTerminated \? 'safety_terminated' : 'completed'/);
});
