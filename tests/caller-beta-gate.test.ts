import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isCallerClosedBetaEnabled, requireCallerClosedBetaEnabled } from '../services/api/src/lib/caller-beta.ts';

function withFlag(value: string | undefined, fn: () => void) {
  const before = process.env.CALLER_CLOSED_BETA_ENABLED;
  if (value === undefined) delete process.env.CALLER_CLOSED_BETA_ENABLED;
  else process.env.CALLER_CLOSED_BETA_ENABLED = value;
  try { fn(); }
  finally {
    if (before === undefined) delete process.env.CALLER_CLOSED_BETA_ENABLED;
    else process.env.CALLER_CLOSED_BETA_ENABLED = before;
  }
}

test('Caller closed beta is fail-closed by default', () => {
  withFlag(undefined, () => {
    assert.equal(isCallerClosedBetaEnabled(), false);
    assert.throws(() => requireCallerClosedBetaEnabled(), (error: unknown) => {
      return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'caller_closed_beta_disabled');
    });
  });
});

test('Caller beta opens only on explicit true', () => {
  withFlag('TRUE', () => {
    assert.equal(isCallerClosedBetaEnabled(), true);
    assert.doesNotThrow(() => requireCallerClosedBetaEnabled());
  });
  withFlag('1', () => assert.equal(isCallerClosedBetaEnabled(), false));
  withFlag('yes', () => assert.equal(isCallerClosedBetaEnabled(), false));
});

test('API boundary gates Caller entry and call-start routes but preserves escape routes', () => {
  const handler = readFileSync(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /\/v1\/caller\/age-gate'[\s\S]*requireCallerClosedBetaEnabled\(\)/);
  assert.match(handler, /\/v1\/listeners'[\s\S]*requireCallerClosedBetaEnabled\(\)/);
  assert.match(handler, /\/v1\/calls\/request'[\s\S]*requireCallerClosedBetaEnabled\(\)/);
  assert.match(handler, /dispatchMatch\)[\s\S]*requireCallerClosedBetaEnabled\(\)/);

  const cancelLine = handler.match(/if \(method === 'POST' && cancelMatch\)[^\n]+/)?.[0] ?? '';
  const safetyLine = handler.match(/if \(method === 'POST' && safetyExitMatch\)[^\n]+/)?.[0] ?? '';
  const getLine = handler.match(/if \(method === 'GET' && callMatch\)[^\n]+/)?.[0] ?? '';
  assert.doesNotMatch(cancelLine, /requireCallerClosedBetaEnabled/);
  assert.doesNotMatch(safetyLine, /requireCallerClosedBetaEnabled/);
  assert.doesNotMatch(getLine, /requireCallerClosedBetaEnabled/);
});

test('bootstrap exposes the same fail-closed feature switch', () => {
  const bootstrap = readFileSync(new URL('../services/api/src/routes/bootstrap.ts', import.meta.url), 'utf8');
  assert.match(bootstrap, /callerClosedBetaEnabled:\s*process\.env\.CALLER_CLOSED_BETA_ENABLED\?\.trim\(\)\.toLowerCase\(\) === 'true'/);
});
