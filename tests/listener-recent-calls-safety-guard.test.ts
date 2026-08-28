import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../services/api/src/routes/listener-calls.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const card = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');

test('listener recent calls are authenticated, listener-scoped and terminal-only', () => {
  const start = backend.indexOf('export async function getListenerRecentCalls');
  assert.ok(start >= 0);
  const section = backend.slice(start);
  assert.match(section, /requireAuth\(req\)/);
  assert.match(section, /WHERE listener_user_id=\$1/);
  assert.match(section, /status::text = ANY\(\$2::text\[\]\)/);
  for (const status of ['completed', 'missed', 'cancelled', 'failed', 'safety_terminated']) {
    assert.ok(backend.includes(`'${status}'`));
  }
  assert.match(section, /value > 20/);
});

test('listener recent call response keeps caller and provider identity private', () => {
  const start = backend.indexOf('export async function getListenerRecentCalls');
  const section = backend.slice(start);
  const response = section.slice(section.indexOf('sendJson(res, 200'));
  assert.match(response, /callerIdentityIncluded: false/);
  assert.match(response, /providerBridgeIncluded: false/);
  assert.doesNotMatch(response, /callerUserId|phone|providerBridgeId|provider_bridge_id/);
  assert.match(response, /counterpartyActionAvailable/);
});

test('listener recent calls route stays outside Caller closed-beta gate', () => {
  const line = handler.match(/if \(method === 'GET' && url\.pathname === '\/v1\/listener\/calls\/recent'\)[^\n]+/)?.[0] ?? '';
  assert.match(line, /ensureDatabaseReady/);
  assert.match(line, /getListenerRecentCalls/);
  assert.doesNotMatch(line, /requireCallerClosedBetaEnabled/);
});

test('mobile post-call safety uses real recent, report and block APIs', () => {
  assert.match(api, /export function getListenerRecentCalls/);
  assert.match(api, /\/v1\/listener\/calls\/recent\?limit=/);
  assert.match(card, /getListenerRecentCalls/);
  assert.match(card, /reportCallSafety/);
  assert.match(card, /blockCallCounterparty/);
  assert.match(card, /counterpartyActionAvailable/);
  assert.match(card, /reportCategories/);
  assert.doesNotMatch(card, /callerUserId|providerBridgeId|phoneE164/);
});

test('recent history refreshes when an active listener call leaves the active set', () => {
  assert.match(card, /previousCallId && !nextCallId/);
  assert.match(card, /await refreshRecent\(\)/);
});
