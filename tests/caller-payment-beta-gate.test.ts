import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');

function routeLine(fragment: string): string {
  const line = source.split('\n').find((candidate) => candidate.includes(fragment));
  assert.ok(line, `missing route ${fragment}`);
  return line;
}

test('starting a new caller wallet top-up requires the closed-beta launch gate', () => {
  const createLine = routeLine("url.pathname === '/v1/wallet/topups'");
  assert.match(createLine, /requireCallerClosedBetaEnabled\(\)/);
  assert.match(createLine, /createCallerWalletTopup/);
});

test('payment recovery and provider callback stay reachable after beta is closed', () => {
  const callbackLine = routeLine("url.pathname === '/v1/payments/nextpay/callback'");
  const verifyLine = routeLine('topupVerifyMatch');
  const readLine = routeLine("const topupMatch = url.pathname.match");
  assert.doesNotMatch(callbackLine, /requireCallerClosedBetaEnabled/);
  assert.doesNotMatch(verifyLine, /requireCallerClosedBetaEnabled/);
  assert.doesNotMatch(readLine, /requireCallerClosedBetaEnabled/);
});
