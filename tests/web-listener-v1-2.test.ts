import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const listenerPage = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');
const listenerProxy = await readFile(new URL('../apps/web/app/api/listener/[...path]/route.ts', import.meta.url), 'utf8');
const homePage = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8');

test('Web Listener proxy keeps the session token server-side and allow-lists work operations', () => {
  assert.match(listenerProxy, /WEB_SESSION_COOKIE/);
  assert.match(listenerProxy, /authorization: `Bearer \$\{token\}`/);
  assert.match(listenerProxy, /browserMutationAllowed/);
  assert.match(listenerProxy, /\^listener\\\/presence\$/);
  assert.match(listenerProxy, /listener\\\/presence\\\/heartbeat/);
  assert.match(listenerProxy, /listener\\\/calls\\\/active/);
  assert.match(listenerProxy, /listener\\\/calls\\\/recent/);
  assert.match(listenerProxy, /voice\\\/\(config\|signals\|heartbeat\|end\|safety-exit\)/);
  assert.match(listenerProxy, /safety\\\/\(report\|block\)/);
  assert.doesNotMatch(listenerProxy, /localStorage|sessionStorage/);
});

test('Web Listener work mode fails closed when the tab goes to background', () => {
  assert.match(listenerPage, /document\.addEventListener\('visibilitychange'/);
  assert.match(listenerPage, /window\.addEventListener\('pagehide'/);
  assert.match(listenerPage, /navigator\.sendBeacon\('\/api\/listener\/listener\/presence'/);
  assert.match(listenerPage, /status: 'offline'/);
  assert.match(listenerPage, /Push پس‌زمینه را آماده اعلام نمی‌کند/);
  assert.match(listenerPage, /Background Listener تا زمان آماده‌شدن اعلان واقعی باز نمی‌شود/);
});

test('Web Listener maintains presence heartbeat only for explicit online or paused work mode', () => {
  assert.match(listenerPage, /current !== 'online' && current !== 'paused'/);
  assert.match(listenerPage, /listener\/presence\/heartbeat/);
  assert.match(listenerPage, /30_000/);
  assert.match(listenerPage, /no_callers_accepted/);
  assert.match(listenerPage, /activeCallConflict/);
});

test('Web Listener answers Internet Voice with browser WebRTC and server signaling', () => {
  assert.match(listenerPage, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(listenerPage, /new RTCPeerConnection/);
  assert.match(listenerPage, /config\.role !== 'listener'/);
  assert.match(listenerPage, /config\.client\.relayConfigured/);
  assert.match(listenerPage, /signal\.senderRole === 'caller'/);
  assert.match(listenerPage, /signal\.kind === 'offer'/);
  assert.match(listenerPage, /createAnswer/);
  assert.match(listenerPage, /kind: 'answer'/);
  assert.match(listenerPage, /kind: 'ice'/);
  assert.match(listenerPage, /kind: 'media_connected'/);
  assert.match(listenerPage, /web_listener_rtc/);
});

test('Web Listener does not fake a recovered media session after page loss', () => {
  assert.match(listenerPage, /سرور تماس را فعال می‌داند اما این تب اتصال WebRTC زنده ندارد/);
  assert.match(listenerPage, /این صفحه اتصال جعلی نمی‌سازد/);
  assert.doesNotMatch(listenerPage, /fake_connected|mock_voice|dev_voice_success/);
});

test('Web Listener exposes safe call termination, earnings and recent-call read models', () => {
  assert.match(listenerPage, /web_listener_ended/);
  assert.match(listenerPage, /web_listener_safety_exit/);
  assert.match(listenerPage, /blockCounterparty: true/);
  assert.match(listenerPage, /listener\/earnings/);
  assert.match(listenerPage, /listener\/calls\/recent\?limit=8/);
  assert.match(listenerPage, /listenerEarningMinor/);
});

test('Web Listener does not render Caller identity, country, phone or payment context before acceptance', () => {
  assert.match(listenerPage, /هویت، کشور و اطلاعات پرداخت Caller قبل از پذیرش نمایش داده نمی‌شود/);
  assert.doesNotMatch(listenerPage, /caller_user_id|callerUserId|callerCountry|paymentCurrency|phoneNumber|providerBridge/);
});

test('verified web session exposes both Caller and Listener entry points', () => {
  assert.match(homePage, /href="\/talk"/);
  assert.match(homePage, /href="\/listener\/work"/);
  assert.match(homePage, /حالت کاری شنونده/);
});
