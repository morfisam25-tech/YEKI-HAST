import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const safety = await readFile(new URL('../services/api/src/routes/safety.ts', import.meta.url), 'utf8');
const mobile = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');

test('block endpoint uses counterparty id internally but never returns it to either participant', () => {
  assert.match(safety, /await upsertBlock\(client, userId, call\.otherUserId, reasonCode\)/);
  const blockRoute = safety.slice(
    safety.indexOf('export async function blockCallCounterparty'),
    safety.indexOf('export async function safetyExitCall'),
  );
  assert.match(blockRoute, /sendJson\(res, 200, \{ ok: true, blocked: true \}\)/);
  assert.doesNotMatch(blockRoute, /blockedUserId/);
  const responseLine = blockRoute.match(/sendJson\(res, 200, ([^\n]+)\)/)?.[1] ?? '';
  assert.doesNotMatch(responseLine, /otherUserId|caller_user_id|listener_user_id/);
});

test('mobile block contract exposes only success state, not counterparty uuid', () => {
  assert.match(mobile, /blockCallCounterparty\(token: string, callId: string\): Promise<\{ ok: true; blocked: true \}>/);
  assert.doesNotMatch(mobile, /blockedUserId/);
});
