import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const screen = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');

test('Caller UI only offers normal cancel in backend-cancellable preconnect states', () => {
  assert.match(screen, /const cancellableStatuses = new Set\(\['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener'\]\)/);
  assert.match(screen, /cancellableStatuses\.has\(call\.status\)/);
  assert.doesNotMatch(screen, /cancellableStatuses = new Set\([^\n]*connected/);
});

test('connected calls retain safety exit without an invalid normal-cancel action', () => {
  assert.match(screen, /!terminalStatuses\.has\(call\.status\)/);
  assert.match(screen, /onPress=\{safetyExit\}/);
  assert.match(screen, /پایان فوری برای ایمنی/);
});

test('Caller UI explains pending telephony termination and settlement states', () => {
  assert.match(screen, /telephony_termination_pending/);
  assert.match(screen, /safety_settlement_pending/);
});
