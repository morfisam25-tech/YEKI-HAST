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

test('only routing calls may retry dispatch with the same call id instead of creating another request', () => {
  assert.match(source, /if \(!call \|\| call\.status !== 'routing'\) return/);
  assert.match(source, /dispatchCall\(token, call\.callId\)/);
  assert.match(source, /const dispatchRetryable = Boolean\(call && call\.status === 'routing'\)/);
  assert.match(source, /ادامه همین تماس/);
});

test('calling_caller with unresolved telephony identity never exposes dispatch retry', () => {
  assert.match(source, /telephonyIdentityStatuses\.has\(call\.status\) && call\.telephonyReady === false/);
  assert.match(source, /شروع دوباره ارسال نمی‌شود/);
  assert.doesNotMatch(source, /call\.status === 'calling_caller' && call\.telephonyReady === false\)\),?\s*\n?\s*\);/);
  assert.match(source, /به‌روزرسانی وضعیت/);
});

test('caller removes and refreshes a listener that becomes unavailable after browse', () => {
  const start = source.indexOf("if (code === 'no_listener_available')");
  assert.ok(start >= 0);
  const section = source.slice(start, source.indexOf('setError(messageFor(code));', start) + 40);
  assert.match(section, /setListeners\(\(current\) => current\.filter\(\(item\) => item\.id !== listener\.id\)\)/);
  assert.match(section, /browseListeners\(token, \{ limit: 20 \}\)/);
  assert.match(section, /setListeners\(browse\.listeners\)/);
});

test('caller termination reconciliation messaging forbids blind retry', () => {
  assert.match(source, /telephony_termination_reconcile_required/);
  assert.match(source, /پایان تماس را دوباره ارسال نکن/);
});
