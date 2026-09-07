import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');

test('caller UI keeps the created call before starting Internet Voice so a failure cannot orphan its reservation', () => {
  const persistIndex = source.indexOf('setCall(requested as CallerCallResponse)');
  const captureIndex = source.indexOf('const startedCallId = requested.callId');
  const voiceIndex = source.indexOf('startInternetVoiceCall(token, startedCallId)');
  assert.ok(persistIndex >= 0, 'requested call must be retained in UI state');
  assert.ok(captureIndex > persistIndex, 'same call id must be captured after retaining the requested call');
  assert.ok(voiceIndex > captureIndex, 'captured call id must start Internet Voice');
});

test('Android primary path never submits a PSTN dispatch retry', () => {
  assert.doesNotMatch(source, /dispatchCall\(/);
  assert.doesNotMatch(source, /retryDispatch/);
  assert.match(source, /const startedCallId = requested\.callId/);
  assert.match(source, /startInternetVoiceCall\(token, startedCallId\)/);
  assert.match(source, /getInternetVoiceConfig\(token, call\.callId\)/);
});

test('Internet Voice reconnect uses the same active call id instead of creating a replacement call', () => {
  assert.match(source, /async function reconnectVoice/);
  assert.match(source, /getInternetVoiceConfig\(token, call\.callId\)/);
  assert.match(source, /createCallerPeer\(call\.callId, config\.client, stream\)/);
  const reconnect = source.match(/async function reconnectVoice[\s\S]*?finally \{ setBusy\(false\); \}\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(reconnect, /requestCall\(/);
});

test('caller removes and refreshes a listener that becomes unavailable after browse', () => {
  const start = source.indexOf("if (code === 'no_listener_available')");
  assert.ok(start >= 0);
  const section = source.slice(start, source.indexOf('setError(messageFor(code));', start) + 40);
  assert.match(section, /setListeners\(\(current\) => current\.filter\(\(item\) => item\.id !== listener\.id\)\)/);
  assert.match(section, /browseListeners\(token, \{ limit: 20 \}\)/);
});

test('Internet Voice end failures do not trigger a blind second transport start', () => {
  assert.match(source, /endInternetVoiceCall\(token, call\.callId\)/);
  const end = source.match(/async function endCall[\s\S]*?finally \{ setBusy\(false\); \}\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(end, /startInternetVoiceCall|requestCall/);
});
