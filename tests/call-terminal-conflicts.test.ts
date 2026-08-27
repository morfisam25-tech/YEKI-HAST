import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const safety = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');

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
