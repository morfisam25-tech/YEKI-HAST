import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const safety = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');

test('shared safety participant boundary rejects self-counterparty call records', () => {
  const start = safety.indexOf('async function participantContext');
  const end = safety.indexOf('async function upsertBlock', start);
  assert.ok(start >= 0 && end > start);
  const section = safety.slice(start, end);

  assert.match(section, /const otherUserId = isCaller \? row\.listener_user_id : row\.caller_user_id/);
  assert.match(section, /if \(!otherUserId\) throw new HttpError\(409, 'call_counterparty_missing'\)/);
  assert.match(section, /if \(otherUserId === userId\) throw new HttpError\(409, 'call_counterparty_invalid'\)/);

  const invalidIndex = section.indexOf("call_counterparty_invalid");
  const returnIndex = section.indexOf('return {');
  assert.ok(invalidIndex >= 0 && returnIndex > invalidIndex);
});

test('report, block and safety exit all use the shared participant boundary', () => {
  const uses = safety.match(/participantContext\(client, callId, userId\)/g) ?? [];
  assert.ok(uses.length >= 3);
  assert.match(safety, /export async function reportCall/);
  assert.match(safety, /export async function blockCallCounterparty/);
  assert.match(safety, /export async function safetyExitCall/);
});
