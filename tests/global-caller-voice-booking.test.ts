import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('caller surface is human-first while preserving real voice and safety contracts', async () => {
  const talk = await source('apps/web/app/talk/page.tsx');
  assert.match(talk, /هویت تأیید شده/);
  assert.match(talk, /این معرفی را خود شنونده نوشته است/);
  assert.match(talk, /هزینه فقط از زمان اتصال واقعی محاسبه می‌شود/);
  assert.match(talk, /مبلغی از اعتبار کم نشده است/);
  assert.match(talk, /genderFilter/);
  assert.match(talk, /languageFilter/);
  assert.match(talk, /voice\/heartbeat/);
  assert.match(talk, /voice\/no-answer/);
  assert.match(talk, /voice\/extend/);
  assert.match(talk, /safety-exit/);
  assert.match(talk, /blockCounterparty: true/);
  assert.match(talk, /relayConfigured/);
});

test('booking surface localizes statuses and makes browser timezone explicit', async () => {
  const booking = await source('apps/web/app/booking/page.tsx');
  assert.match(booking, /resolvedOptions\(\)\.timeZone/);
  assert.match(booking, /برنامه‌ریزی‌شده/);
  assert.match(booking, /تماس شروع شده/);
  assert.match(booking, /لغوشده/);
  assert.match(booking, /از دست‌رفته/);
  assert.match(booking, /bookable-listeners\?/);
  assert.match(booking, /gender/);
  assert.match(booking, /language/);
  assert.match(booking, /bookings\/\$\{id\}\/cancel/);
  assert.doesNotMatch(booking, /HOLD/);
});

test('reserved call keeps real-time voice, no-answer, extension, and safety exit behavior', async () => {
  const call = await source('apps/web/app/booking/call/page.tsx');
  assert.match(call, /getUserMedia/);
  assert.match(call, /bookings\/\$\{bookingId\}\/start/);
  assert.match(call, /voice\/start/);
  assert.match(call, /voice\/signals/);
  assert.match(call, /voice\/no-answer/);
  assert.match(call, /voice\/extend/);
  assert.match(call, /safety-exit/);
  assert.match(call, /blockCounterparty: true/);
  assert.match(call, /relayConfigured/);
  assert.match(call, /مبلغی از اعتبار کم نشده است/);
  assert.doesNotMatch(call, /HOLD/);
});
