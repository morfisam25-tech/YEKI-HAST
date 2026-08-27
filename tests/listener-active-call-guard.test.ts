import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../services/api/src/routes/listener-calls.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const card = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');
const workScreen = await readFile(new URL('../apps/mobile/src/ListenerWorkScreen.tsx', import.meta.url), 'utf8');

test('listener active call read model is authenticated and listener-scoped', () => {
  assert.match(route, /requireAuth\(req\)/);
  assert.match(route, /WHERE listener_user_id=\$1/);
  assert.match(route, /status::text = ANY\(\$2::text\[\]\)/);
  assert.match(route, /LIMIT 2/);
  assert.match(route, /listener_active_call_conflict/);
});

test('listener active call response exposes no caller identity or raw bridge id', () => {
  assert.match(route, /telephonyReady: Boolean\(row\.provider_bridge_id\)/);
  assert.match(route, /providerBridgeIncluded: false/);
  assert.match(route, /callerIdentityIncluded: false/);
  assert.doesNotMatch(route, /callerUserId\s*:/);
  assert.doesNotMatch(route, /providerBridgeId\s*:/);
});

test('listener active call endpoint stays outside the Caller closed-beta gate', () => {
  const line = handler.split('\n').find((value) => value.includes("'/v1/listener/calls/active'"));
  assert.ok(line);
  assert.match(line, /getListenerActiveCall/);
  assert.doesNotMatch(line, /requireCallerClosedBetaEnabled/);
});

test('mobile listener work mode polls active call only while foregrounded and exposes Safety Exit', () => {
  assert.match(api, /getListenerActiveCall/);
  assert.match(api, /\/v1\/listener\/calls\/active/);
  assert.match(card, /setInterval/);
  assert.match(card, /5_000/);
  assert.match(card, /AppState/);
  assert.match(card, /safetyExitCall/);
  assert.match(card, /activeCall\.telephonyReady/);
  assert.match(card, /activeCall\.status === 'calling_listener'/);
  assert.match(card, /activeCall\.status === 'connected'/);
  assert.doesNotMatch(card, /cancelCall|dispatchCall/);
  assert.match(workScreen, /<ListenerActiveCallCard token=\{token\} \/>/);
});
