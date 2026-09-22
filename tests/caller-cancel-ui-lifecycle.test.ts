import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const screen = (await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

test('Caller UI uses local cancel only while the call is still unclaimed in routing', () => {
  const end = screen.match(/async function endCall[\s\S]*?finally \{ setBusy\(false\); \}\n  \}/)?.[0] ?? '';
  assert.match(end, /call\.status === 'routing'/);
  assert.match(end, /cancelCall\(token, call\.callId\)/);
  assert.match(end, /endInternetVoiceCall\(token, call\.callId\)/);
});

test('connected Internet Voice keeps explicit normal end and Safety Exit controls', () => {
  assert.match(screen, /endInternetVoiceCall\(token, call\.callId\)/);
  assert.match(screen, /safetyExitInternetVoiceCall\(token, call\.callId\)/);
  assert.match(screen, /پایان تماس/);
  assert.match(screen, /پایان فوری برای ایمنی/);
  assert.doesNotMatch(screen, /dispatchCall\(/);
});

test('Caller UI surfaces Internet Voice end conflicts without starting another call', () => {
  assert.match(screen, /call_end_conflict/);
  assert.match(screen, /call_not_live/);
  const end = screen.match(/async function endCall[\s\S]*?finally \{ setBusy\(false\); \}\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(end, /requestCall|startInternetVoiceCall/);
});
