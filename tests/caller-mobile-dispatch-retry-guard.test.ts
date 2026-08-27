import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');

test('caller UI keeps the created call before dispatch so a network failure cannot orphan its reservation', () => {
  const persistIndex = source.indexOf('setCall(requested)');
  const dispatchIndex = source.indexOf('dispatchCall(token, requested.callId)');
  assert.ok(persistIndex >= 0, 'requested call must be persisted in UI state');
  assert.ok(dispatchIndex >= 0, 'requested call must be dispatched');
  assert.ok(persistIndex < dispatchIndex, 'callId must be retained before dispatch begins');
});

test('routing calls retry dispatch with the same call id instead of creating another request', () => {
  assert.match(source, /call\.status !== 'routing'/);
  assert.match(source, /dispatchCall\(token, call\.callId\)/);
  assert.match(source, /continue|ادامه همین تماس/);
});
