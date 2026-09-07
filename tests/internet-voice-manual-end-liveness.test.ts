import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const lifecycle = await readFile(new URL('../services/api/src/services/internet-voice-lifecycle.ts', import.meta.url), 'utf8');
const endRoute = await readFile(new URL('../services/api/src/routes/internet-voice-end.ts', import.meta.url), 'utf8');
const mobileCaller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const mobileListener = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');
const webCaller = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const webListener = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');

test('manual connected-call settlement accepts only an internal server-derived effective end', () => {
  assert.match(lifecycle, /effectiveEndAt\?: string \| null/);
  assert.match(lifecycle, /LEAST\(now\(\), COALESCE\(\$2::timestamptz, now\(\)\)\)/);
  assert.match(endRoute, /effectiveEndAt: prepared\.effectiveEndAt/);
  const requestBody = endRoute.match(/const body = await readJson<[\s\S]*?>\(req\);/)?.[0] ?? '';
  assert.doesNotMatch(requestBody, /effectiveEndAt/);
});

test('manual end trusts only an unresolved counterparty reconnecting signal as an earlier cutoff', () => {
  assert.match(endRoute, /FROM app\.internet_voice_signals reconnecting/);
  assert.match(endRoute, /reconnecting\.sender_role <> \$2/);
  assert.match(endRoute, /reconnecting\.signal_kind='reconnecting'/);
  assert.match(endRoute, /recovered\.sender_role=reconnecting\.sender_role/);
  assert.match(endRoute, /recovered\.signal_kind='reconnected'/);
  assert.match(endRoute, /recovered\.created_at > reconnecting\.created_at/);
});

test('all live WebRTC clients publish reconnecting and reconnected state to the authenticated signaling route', () => {
  for (const source of [mobileCaller, mobileListener, webCaller, webListener]) {
    assert.match(source, /connectionState === 'disconnected' \|\| .*connectionState === 'failed'/);
    assert.match(source, /'reconnecting'/);
    assert.match(source, /'reconnected'/);
    assert.match(source, /source: 'peer_connection_state'/);
  }
});
