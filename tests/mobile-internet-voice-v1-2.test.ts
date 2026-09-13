import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../apps/mobile/App.tsx', import.meta.url), 'utf8');
const caller = (await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const listener = (await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const voiceApi = await readFile(new URL('../apps/mobile/src/internet-voice-api.ts', import.meta.url), 'utf8');
const appConfig = await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8');
const mobilePackage = await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8');

test('Android native build declares WebRTC dependency, plugin and audio-only microphone permission surface', () => {
  assert.match(mobilePackage, /"react-native-webrtc": "\^124\.0\.8"/);
  assert.match(mobilePackage, /"@config-plugins\/react-native-webrtc": "\^15\.0\.2"/);
  assert.match(appConfig, /@config-plugins\/react-native-webrtc/);
  assert.match(appConfig, /"permissions"[\s\S]*android\.permission\.RECORD_AUDIO/);
  assert.match(appConfig, /"blockedPermissions"[\s\S]*android\.permission\.CAMERA/);
});

test('Android Store-facing shell describes Internet Voice accurately and exposes required public policy/support links', () => {
  assert.match(app, /تماس زنده از اینترنت برقرار می‌شود/);
  assert.match(app, /تماس اصلی از اینترنت انجام می‌شود و شماره واقعی دو طرف برای آن لازم نیست یا نمایش داده نمی‌شود/);
  assert.doesNotMatch(app, /شماره تماس جداگانه تأیید می‌شود/);
  assert.match(app, /legal\?\.privacyPolicyUrl/);
  assert.match(app, /legal\?\.termsOfServiceUrl/);
  assert.match(app, /legal\?\.accountDeletionUrl/);
  assert.match(app, /legal\?\.childSafetyUrl/);
  assert.match(app, /legal\?\.supportEmail/);
  assert.doesNotMatch(app, /https:\/\/yekihast\.app/);
  assert.doesNotMatch(app, /sales@uniqueholding\.com\.tr/);
});

test('Android Caller requests microphone before creating the Wallet HOLD and never dispatches PSTN', () => {
  const start = caller.match(/async function startCall[\s\S]*?finally \{ setBusy\(false\); \}\n  \}/)?.[0] ?? '';
  assert.match(start, /ensureMicrophone\(\)/);
  assert.match(start, /requestCall\(/);
  assert.ok(start.indexOf('ensureMicrophone()') < start.indexOf('requestCall('));
  assert.match(start, /startInternetVoiceCall\(/);
  assert.doesNotMatch(caller, /dispatchCall\(/);
  assert.doesNotMatch(caller, /CallPhoneSetupCard/);
});

test('Android Caller enforces locked initial caps and Internet Voice extension choices', () => {
  assert.match(caller, /type CapMinutes = 10 \| 30 \| 60/);
  assert.match(caller, /\(\[10, 30, 60\] as CapMinutes\[\]\)/);
  assert.match(caller, /maxSeconds: maxMinutes \* 60/);
  assert.match(caller, /extendInternetVoiceCall/);
  assert.match(caller, /void extend\(15\)/);
  assert.match(caller, /void extend\(30\)/);
});

test('Android Caller uses signaling, both-sides media confirmation, heartbeat caps and no-answer expiry', () => {
  assert.match(caller, /new RTCPeerConnection/);
  assert.match(caller, /createOffer/);
  assert.match(caller, /postInternetVoiceSignal\(token, callId, 'offer'/);
  assert.match(caller, /postInternetVoiceSignal\(token, callId, 'media_connected'/);
  assert.match(caller, /heartbeatInternetVoiceCall/);
  assert.match(caller, /expireInternetVoiceNoAnswer/);
  assert.match(caller, /remaining <= 60/);
  assert.match(caller, /remaining <= 120/);
});

test('Android Listener explicitly accepts Internet Voice before microphone access and answers the caller offer', () => {
  const answer = listener.match(/async function answerInternetCall[\s\S]*?finally \{ setBusy\(false\); \}\n  \}/)?.[0] ?? '';
  assert.match(answer, /ensureMicrophone\(\)/);
  assert.match(answer, /getInternetVoiceConfig/);
  assert.match(answer, /getInternetVoiceSignals/);
  assert.match(listener, /async function consumeCallerSignal\(callId: string/);
  assert.match(listener, /createAnswer/);
  assert.match(listener, /postInternetVoiceSignal\(token, callId, 'answer'/);
  assert.match(listener, /پاسخ تماس/);
  assert.doesNotMatch(listener, /activeCallIdRef\.current \?\? ''/);
});

test('Android Listener confirms media connection and participates in authoritative heartbeat enforcement', () => {
  assert.match(listener, /postInternetVoiceSignal\(token, callId, 'media_connected'/);
  assert.match(listener, /heartbeatInternetVoiceCall/);
  assert.match(listener, /endInternetVoiceCall/);
  assert.match(listener, /safetyExitInternetVoiceCall/);
});

test('mobile Internet Voice API maps every v1.2 voice lifecycle endpoint', () => {
  for (const suffix of [
    '/voice/start',
    '/voice/config',
    '/voice/signals',
    '/voice/no-answer',
    '/voice/heartbeat',
    '/voice/extend',
    '/voice/end',
    '/voice/safety-exit',
  ]) {
    assert.match(voiceApi, new RegExp(suffix.replaceAll('/', '\\/')));
  }
});
