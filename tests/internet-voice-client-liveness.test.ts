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
  assert.match(mobileCaller, /peerRef\.current\?\.connectionState !== 'connected'/);
  assert.match(mobileListener, /peerRef\.current\?\.connectionState !== 'connected'/);
});

test('clients still mark media connected from real peer connection state', () => {
  assert.match(webCaller, /pc\.connectionState === 'connected'/);
  assert.match(webListener, /pc\.connectionState === 'connected'/);
  assert.match(mobileCaller, /peer\.connectionState === 'connected'/);
  assert.match(mobileListener, /peer\.connectionState === 'connected'/);
});
