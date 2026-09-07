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
  assert.match(route, /WHERE cs?\.listener_user_id=\$1|WHERE listener_user_id=\$1/);
  assert.match(route, /status::text = ANY\(\$2::text\[\]\)/);
  assert.match(route, /LIMIT 2/);
  assert.match(route, /listener_active_call_conflict/);
});

test('listener active call response exposes safe transport state without caller identity or raw bridge id', () => {
  assert.match(route, /transport: row\.transport/);
  assert.match(route, /internetVoiceReady: row\.transport === 'internet_voice'/);
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

test('mobile listener work mode uses foreground-only adaptive jittered polling and real Internet Voice controls', () => {
  assert.match(api, /getListenerActiveCall/);
  assert.match(api, /\/v1\/listener\/calls\/active/);
  assert.match(card, /setTimeout/);
  assert.match(card, /clearTimeout/);
  assert.doesNotMatch(card, /setInterval/);
  assert.match(card, /ACTIVE_POLL_BASE_MS = 3_000/);
  assert.match(card, /ACTIVE_POLL_JITTER_MS = 2_000/);
  assert.match(card, /IDLE_POLL_BASE_MS = 20_000/);
  assert.match(card, /IDLE_POLL_JITTER_MS = 10_000/);
  assert.match(card, /Math\.random\(\)/);
  assert.match(card, /appStateRef\.current/);
  assert.match(card, /refreshInFlight/);
  assert.match(card, /AppState/);
  assert.match(card, /answerInternetCall/);
  assert.match(card, /postInternetVoiceSignal/);
  assert.match(card, /heartbeatInternetVoiceCall/);
  assert.match(card, /safetyExitInternetVoiceCall/);
  assert.match(card, /activeCall\.status === 'calling_listener'/);
  assert.match(card, /activeCall\.status === 'connected'/);
  assert.doesNotMatch(card, /cancelCall|dispatchCall/);
  assert.match(workScreen, /<ListenerActiveCallCard token=\{token\} onActiveCallConflictChange=\{setActiveCallConflict\} \/>/);
});

test('duplicate listener active calls lock ready-state controls without mutating presence automatically', () => {
  assert.match(card, /onActiveCallConflictChange\?: \(conflicted: boolean\) => void/);
  assert.match(card, /code === 'listener_active_call_conflict'/);
  assert.match(card, /onActiveCallConflictChange\?\.\(true\)/);
  assert.match(card, /onActiveCallConflictChange\?\.\(false\)/);
  assert.match(workScreen, /const \[activeCallConflict, setActiveCallConflict\] = useState\(false\)/);
  assert.match(workScreen, /activeCallConflict && status !== 'offline'/);
  assert.match(workScreen, /disabled=\{workControlsLocked\}/);
  assert.match(workScreen, /سرور این حساب را به‌دلیل وجود چند تماس فعال از دریافت تماس جدید کنار می‌گذارد/);
  assert.doesNotMatch(workScreen, /activeCallConflict[\s\S]{0,200}setListenerPresence\(token, 'offline'/);
});

test('paused listener work mode renders one resume path rather than duplicate online actions', () => {
  assert.match(workScreen, /!isOnline && !isPaused/);
  assert.match(workScreen, /\{isPaused && \(/);
  assert.match(workScreen, />ادامه کار</);
});
