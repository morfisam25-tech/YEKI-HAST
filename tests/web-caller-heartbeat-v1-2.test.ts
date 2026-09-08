import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const talk = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const callerProxy = await readFile(new URL('../apps/web/app/api/caller/[...path]/route.ts', import.meta.url), 'utf8');

test('web Caller sends an authenticated server heartbeat during connected Internet Voice calls', () => {
  assert.match(talk, /phase !== 'connected' \|\| !callId/);
  assert.match(talk, /calls\/\$\{callId\}\/voice\/heartbeat/);
  assert.match(talk, /method: 'POST'/);
  assert.match(talk, /setInterval\(\(\) => void heartbeat\(\), 5_000\)/);
  assert.match(callerProxy, /voice\\\/\\\(start\|config\|signals\|no-answer\|extend\|heartbeat\|end\|safety-exit\\\)/);
});

test('web Caller treats server cap completion as authoritative and cleans up RTC', () => {
  assert.match(talk, /result\.terminal/);
  assert.match(talk, /result\.capReached/);
  assert.match(talk, /setPhase\('ended'\)/);
  assert.match(talk, /cleanupRtc\(\)/);
  assert.match(talk, /زمان انتخاب‌شده تمام شد/);
});
