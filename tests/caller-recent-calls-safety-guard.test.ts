import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../services/api/src/routes/caller-calls.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const client = await readFile(new URL('../apps/mobile/src/caller-history-api.ts', import.meta.url), 'utf8');
const card = await readFile(new URL('../apps/mobile/src/CallerRecentCallsCard.tsx', import.meta.url), 'utf8');
const caller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');

test('caller recent calls are authenticated, caller-scoped, terminal-only and bounded', () => {
  assert.match(route, /requireAuth\(req\)/);
  assert.match(route, /WHERE caller_user_id=\$1/);
  assert.match(route, /status::text = ANY\(\$2::text\[\]\)/);
  assert.match(route, /completed/);
  assert.match(route, /safety_terminated/);
  assert.match(route, /value > 20/);
  assert.match(handler, /'\/v1\/caller\/calls\/recent'/);
  assert.match(handler, /getCallerRecentCalls/);
});

test('caller recent call response does not expose listener identity or provider bridge', () => {
  assert.match(route, /providerBridgeIncluded: false/);
  assert.match(route, /listenerIdentityIncluded: false/);
  assert.doesNotMatch(route, /listenerId\s*:/);
  assert.doesNotMatch(route, /providerBridgeId\s*:/);
  assert.match(route, /counterpartyActionAvailable/);
});

test('caller mobile history supports post-call report and block without exposing identity', () => {
  assert.match(client, /\/v1\/caller\/calls\/recent/);
  assert.match(card, /reportCallSafety/);
  assert.match(card, /blockCallCounterparty/);
  assert.match(card, /counterpartyActionAvailable/);
  assert.match(card, /هویت واقعی شنونده در این صفحه نمایش داده نمی‌شود/);
  assert.match(caller, /<CallerRecentCallsCard token=\{token\} \/>/);
});
