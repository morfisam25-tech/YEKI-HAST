import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webCaller = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const webListener = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');
const mobileCaller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const mobileListener = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');

test('every Internet Voice client sends billing liveness only while its peer connection is connected', () => {
  // W63: web now gates heartbeat liveness by transport (mediaProviderRef),
  // exactly mirroring W60's mobile pattern below -- LEGACY_P2P_PREVIEW_ONLY
  // still requires the exact same real pcRef.current?.connectionState==='connected'
  // check; the RealtimeKit path requires useRealtimeVoiceCall's own genuine
  // two-party connected state (remoteParticipantPresent, derived only from a
  // real roomJoined + another participant present -- see
  // apps/web/app/realtime-media.ts) instead of a peer connection that path
  // never creates. Neither branch sends a heartbeat without a real,
  // transport-verified connected state.
  assert.match(webCaller, /realtimeCall\.remoteParticipantPresent\s*\n\s*: pcRef\.current\?\.connectionState === 'connected'/);
  assert.match(webCaller, /if \(!active \|\| running \|\| !mediaLive\) return;/);
  assert.match(webListener, /realtimeCall\.remoteParticipantPresent\s*\n\s*: pcRef\.current\?\.connectionState === 'connected'/);
  assert.match(webListener, /if \(running \|\| !mediaLive\) return;/);
  // W60: mobile gates heartbeat liveness by transport (CALL_MEDIA_PROVIDER)
  // the exact same way.
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
