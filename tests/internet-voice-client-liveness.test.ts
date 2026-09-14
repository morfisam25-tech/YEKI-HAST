import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webCaller = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const webListener = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');
const mobileCaller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const mobileListener = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');

test('every Internet Voice client sends billing liveness only while its peer connection is connected', () => {
  assert.match(webCaller, /pcRef\.current\?\.connectionState !== 'connected'/);
  assert.match(webListener, /pcRef\.current\?\.connectionState !== 'connected'/);
  // W60: mobile now gates heartbeat liveness by transport
  // (CALL_MEDIA_PROVIDER) -- LEGACY_P2P_PREVIEW_ONLY still requires the exact
  // same real peer.connectionState==='connected' check; the RealtimeKit path
  // requires useRealtimeVoiceCall's own genuine two-party 'connected' state
  // (see apps/mobile/src/realtime-media.ts) instead of a peer connection that
  // path never creates. Neither branch sends a heartbeat without a real,
  // transport-verified connected state.
  assert.match(mobileCaller, /peerRef\.current\?\.connectionState === 'connected'\s*\n\s*: realtimeCall\.state === 'connected'/);
  assert.match(mobileCaller, /if \(!mediaLive\) return;/);
  assert.match(mobileListener, /peerRef\.current\?\.connectionState === 'connected'\s*\n\s*: realtimeCall\.state === 'connected'/);
  assert.match(mobileListener, /if \(!mediaLive\) return;/);
});

test('clients still mark media connected from real peer connection state', () => {
  assert.match(webCaller, /pc\.connectionState === 'connected'/);
  assert.match(webListener, /pc\.connectionState === 'connected'/);
  assert.match(mobileCaller, /peer\.connectionState === 'connected'/);
  assert.match(mobileListener, /peer\.connectionState === 'connected'/);
});
