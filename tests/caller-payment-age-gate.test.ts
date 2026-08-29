import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const wrapper = await readFile(new URL('../services/api/src/routes/caller-payments.ts', import.meta.url), 'utf8');

test('new caller top-ups go through the age-aware payment wrapper', () => {
  const line = handler.split('\n').find((candidate) => candidate.includes("url.pathname === '/v1/wallet/topups'"));
  assert.ok(line);
  assert.match(line, /requireCallerClosedBetaEnabled\(\)/);
  assert.match(line, /createCallerWalletTopup/);
  assert.doesNotMatch(line, /createWalletTopup/);
});

test('caller payment wrapper requires the current configured age assertion before creating a payment', () => {
  assert.match(wrapper, /requireAuth\(req\)/);
  assert.match(wrapper, /requireCurrentCallerAgeAssertion\(userId\)/);
  assert.match(wrapper, /createWalletTopup\(req, res\)/);
  assert.ok(wrapper.indexOf('requireCurrentCallerAgeAssertion(userId)') < wrapper.indexOf('createWalletTopup(req, res)'));
});
