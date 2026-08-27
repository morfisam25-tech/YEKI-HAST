import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const safety = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');

test('idempotent safety-exit retry can still honor a newly requested counterparty block', () => {
  const branch = safety.match(/if \(call\.status === 'safety_terminated'\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
  assert.match(branch, /if \(blockCounterparty\)/);
  assert.match(branch, /await upsertBlock\(client, userId, call\.otherUserId, 'safety_exit'\)/);
  assert.match(branch, /idempotent: true/);
});

test('idempotent safety-exit branch does not create another safety event or release wallet funds again', () => {
  const branch = safety.match(/if \(call\.status === 'safety_terminated'\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
  assert.doesNotMatch(branch, /INSERT INTO app\.safety_events/);
  assert.doesNotMatch(branch, /UPDATE app\.wallets/);
  assert.doesNotMatch(branch, /INSERT INTO app\.call_events/);
});
