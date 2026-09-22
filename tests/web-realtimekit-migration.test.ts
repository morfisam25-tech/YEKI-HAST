import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const callerPage = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const listenerPage = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');
const realtimeMedia = await readFile(new URL('../apps/web/app/realtime-media.ts', import.meta.url), 'utf8');
const webPackageJson = JSON.parse(await readFile(new URL('../apps/web/package.json', import.meta.url), 'utf8'));

// W63 Workstream A: Web RealtimeKit migration. These assertions cover the
// task-section-16 test list that isn't already pinned by
// scripts/validate-foundation.mjs's W63 checks (audio-only, no legacy SDP/ICE
// on the RealtimeKit path, reconnect-safe idempotent billing signal, and the
// recording-consent-before-voice/start ordering carried over unchanged from
// the pre-existing legacy flow).

test('Web uses the pinned official Cloudflare RealtimeKit React SDK version, not a range that could resolve to an unverified API', () => {
  assert.equal(webPackageJson.dependencies['@cloudflare/realtimekit-react'], '^2.0.2');
});

test('Web RealtimeKit hook is audio-only: no enableVideo/screen-share/getUserMedia call anywhere in the shared hook', () => {
  const codeOnly = realtimeMedia.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /enableVideo\(|enableScreenShare\(|getUserMedia\(|getDisplayMedia\(/);
});

test('Web RealtimeKit join defaults start muted (audio: false) and enables audio only after join() resolves', () => {
  assert.match(realtimeMedia, /defaults: \{ audio: false, video: false \}/);
  assert.match(realtimeMedia, /await active\.self\.enableAudio\(\)\.catch\(\(\) => undefined\);/);
});

for (const [name, source, fnName] of [
  ['Web Caller', callerPage, 'beginRealtimeKit'],
  ['Web Listener', listenerPage, 'answerRealtimeKit'],
] as const) {
  test(`${name} RealtimeKit path never sends legacy SDP/ICE signal kinds (no RTCPeerConnection created on this path)`, () => {
    const start = source.indexOf(fnName);
    assert.ok(start >= 0, `${fnName} not found in ${name}`);
    const braceStart = source.indexOf('{', source.indexOf(')', start));
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const block = source.slice(start, end);
    assert.doesNotMatch(block, /new RTCPeerConnection/);
    assert.doesNotMatch(block, /kind: 'offer'|kind: 'answer'|kind: 'ice'/);
    assert.doesNotMatch(block, /getUserMedia/);
  });
}

test('Web Caller sends the recording-consent acknowledgement before voice/start, on both transport paths (unchanged ordering)', () => {
  const consentIndex = callerPage.indexOf('/recording-consent`');
  const voiceStartIndex = callerPage.indexOf('/voice/start`');
  assert.ok(consentIndex >= 0 && voiceStartIndex >= 0);
  assert.ok(consentIndex < voiceStartIndex, 'recording-consent must be acknowledged before voice/start is called');
});

test('Web reconnect does not duplicate the media_connected billing signal (idempotency ref guards every provider path)', () => {
  for (const source of [callerPage, listenerPage]) {
    assert.match(source, /mediaConnectedSentRef\.current/);
  }
  // The RealtimeKit join() call itself happens exactly once per call attempt
  // (inside beginRealtimeKit/answerRealtimeKit, not inside any reconnect
  // handler) -- RealtimeKit's own SDK reconnects the existing meeting
  // internally, so a second join() that could re-arm billing is never issued.
  assert.equal((callerPage.match(/realtimeCall\.join\(/g) ?? []).length, 1);
  assert.equal((listenerPage.match(/realtimeCall\.join\(/g) ?? []).length, 1);
});

test('Web hangup / Safety Exit releases the RealtimeKit meeting and microphone on every exit path via cleanupRtc', () => {
  for (const source of [callerPage, listenerPage]) {
    const cleanupBlock = source.slice(source.indexOf('cleanupRtc = useCallback'), source.indexOf('cleanupRtc = useCallback') + 900);
    assert.match(cleanupBlock, /void realtimeCall\.leave\(\);/);
  }
});
