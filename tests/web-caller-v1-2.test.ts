import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const callerPage = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const callerProxy = await readFile(new URL('../apps/web/app/api/caller/[...path]/route.ts', import.meta.url), 'utf8');
const manifestSource = await readFile(new URL('../apps/web/app/manifest.ts', import.meta.url), 'utf8');
const pwaRegister = await readFile(new URL('../apps/web/app/PwaRegister.tsx', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../apps/web/public/sw.js', import.meta.url), 'utf8');

test('Web Caller proxy keeps the session token server-side and allow-lists Caller operations', () => {
  assert.match(callerProxy, /WEB_SESSION_COOKIE/);
  assert.match(callerProxy, /authorization: `Bearer \$\{token\}`/);
  assert.match(callerProxy, /browserMutationAllowed/);
  assert.match(callerProxy, /\^listeners\$/);
  assert.match(callerProxy, /cancel\$/);
  assert.match(callerProxy, /voice\\\/\(start\|config\|signals\|no-answer\|extend\|heartbeat\|end\|safety-exit\)/);
  assert.doesNotMatch(callerProxy, /localStorage|sessionStorage/);
});

test('Web Caller implements the locked 10/30/60 maximum choices and explicit age confirmation', () => {
  assert.match(callerPage, /\(\[600, 1800, 3600\] as const\)/);
  assert.match(callerPage, /maxSeconds: capSeconds/);
  assert.match(callerPage, /ageConfirmed/);
  assert.match(callerPage, /caller\/age-gate/);
});

test('Web Caller acquires microphone before creating a call/HOLD and compensates post-create failures', () => {
  const micIndex = callerPage.indexOf("preparedStream = await navigator.mediaDevices.getUserMedia");
  const callIndex = callerPage.indexOf("const call = await api<{ callId: string; maxBillableSeconds: number }>('calls/request'");
  assert.ok(micIndex >= 0);
  assert.ok(callIndex > micIndex);
  assert.match(callerPage, /createdCallId/);
  assert.match(callerPage, /voiceStarted/);
  assert.match(callerPage, /`calls\/\$\{createdCallId\}\/voice\/end`/);
  assert.match(callerPage, /`calls\/\$\{createdCallId\}\/cancel`/);
  assert.match(callerPage, /cause instanceof DOMException \? cause\.name/);
});

test('Web Caller uses browser WebRTC and server signaling rather than PSTN dispatch', () => {
  assert.match(callerPage, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(callerPage, /new RTCPeerConnection/);
  assert.match(callerPage, /createOffer/);
  assert.match(callerPage, /kind: 'offer'/);
  assert.match(callerPage, /kind: 'ice'/);
  assert.match(callerPage, /kind: 'media_connected'/);
  assert.doesNotMatch(callerPage, /\/dispatch|provider_bridge|phoneNumber/);
});

test('Web Caller handles 90-second no-answer, actual connected timing, warnings and extensions', () => {
  assert.match(callerPage, /voice\/no-answer/);
  assert.match(callerPage, /noAnswerSeconds/);
  assert.match(callerPage, /connectedAt/);
  assert.match(callerPage, /remaining <= 60 \? 60 : remaining <= 120 \? 120/);
  assert.match(callerPage, /extend\(15\)/);
  assert.match(callerPage, /extend\(30\)/);
  assert.match(callerPage, /voice\/end/);
});

test('Web listener cards distinguish verified status from self-declared intro', () => {
  assert.match(callerPage, /هویت\/فیلدهای تأییدشده مشخص است/);
  assert.match(callerPage, /معرفی خوداظهاری \(تأییدنشده\)/);
});

test('Web Caller is an installable PWA without caching authenticated or call data', () => {
  assert.match(manifestSource, /start_url: '\/talk'/);
  assert.match(manifestSource, /display: 'standalone'/);
  assert.match(manifestSource, /\/icon\.svg/);
  assert.match(pwaRegister, /serviceWorker\.register\('\/sw\.js'/);
  assert.match(serviceWorker, /not cached/);
  assert.doesNotMatch(serviceWorker, /caches\.open|cache\.put|respondWith/);
});
