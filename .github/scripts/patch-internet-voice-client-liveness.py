from pathlib import Path

# Web Caller: a server heartbeat is proof of a live media connection, not merely UI state.
path = Path('apps/web/app/talk/page.tsx')
text = path.read_text()
old = """    const heartbeat = async () => {
      if (!active || running) return;
      running = true;
"""
new = """    const heartbeat = async () => {
      if (!active || running || pcRef.current?.connectionState !== 'connected') return;
      running = true;
"""
if old not in text:
    raise SystemExit('Web Caller heartbeat target not found')
path.write_text(text.replace(old, new, 1))

# Web Listener: same rule. A stale server status must not keep billing after peer failure.
path = Path('apps/web/app/listener/work/page.tsx')
text = path.read_text()
old = """    const heartbeat = async () => {
      if (running) return;
      running = true;
      try {
        const result = await api<{ terminal: boolean; capReached: boolean; timing: VoiceTiming }>(`calls/${activeCall.callId}/voice/heartbeat`, {
"""
new = """    const heartbeat = async () => {
      if (running || pcRef.current?.connectionState !== 'connected') return;
      running = true;
      try {
        const result = await api<{ terminal: boolean; capReached: boolean; timing: VoiceTiming }>(`calls/${activeCall.callId}/voice/heartbeat`, {
"""
if old not in text:
    raise SystemExit('Web Listener heartbeat target not found')
path.write_text(text.replace(old, new, 1))

# Mobile Caller.
path = Path('apps/mobile/src/CallerClosedBetaScreen.tsx')
text = path.read_text()
old = """    async function heartbeat() {
      try {
        const result = await heartbeatInternetVoiceCall(token, callId);
"""
new = """    async function heartbeat() {
      if (peerRef.current?.connectionState !== 'connected') return;
      try {
        const result = await heartbeatInternetVoiceCall(token, callId);
"""
if old not in text:
    raise SystemExit('Mobile Caller heartbeat target not found')
path.write_text(text.replace(old, new, 1))

# Mobile Listener.
path = Path('apps/mobile/src/ListenerActiveCallCard.tsx')
text = path.read_text()
old = """    async function heartbeat() {
      try {
        const result = await heartbeatInternetVoiceCall(token, callId);
"""
new = """    async function heartbeat() {
      if (peerRef.current?.connectionState !== 'connected') return;
      try {
        const result = await heartbeatInternetVoiceCall(token, callId);
"""
if old not in text:
    raise SystemExit('Mobile Listener heartbeat target not found')
path.write_text(text.replace(old, new, 1))

Path('tests/internet-voice-client-liveness.test.ts').write_text("""import assert from 'node:assert/strict';
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
""")
