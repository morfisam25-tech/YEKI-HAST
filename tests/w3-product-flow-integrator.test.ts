import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const talk = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');
const booking = await readFile(new URL('../apps/web/app/booking/page.tsx', import.meta.url), 'utf8');
const bookingCall = await readFile(new URL('../apps/web/app/booking/call/page.tsx', import.meta.url), 'utf8');
const quote = await readFile(new URL('../apps/web/components/caller/CallCostQuote.tsx', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../apps/web/app/api/caller/[...path]/route.ts', import.meta.url), 'utf8');
const callRoutes = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const noAnswer = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');
const settlement = await readFile(new URL('../services/api/src/services/internet-voice-lifecycle.ts', import.meta.url), 'utf8');

test('pre-call quote comes from live bootstrap pricing and current wallet rather than hard-coded Iran numbers', () => {
  assert.match(proxy, /\^bootstrap\$/);
  assert.match(quote, /getJson<Bootstrap>\('bootstrap'\)/);
  assert.match(quote, /getJson<WalletResponse>\('wallet'\)/);
  assert.match(quote, /callerRatePerMinuteMinor/);
  assert.match(quote, /BigInt\(bootstrap\.pricing\.callerRatePerMinuteMinor\) \* BigInt\(seconds\)/);
  assert.match(quote, /BigInt\(59\)\) \/ BigInt\(60\)/);
  assert.match(quote, /فقط زمان اتصال واقعی کم می‌شود/);
  assert.doesNotMatch(quote, /4000|۴۰۰۰|2800|۲۸۰۰|1200|۱۲۰۰/);
});

test('instant call preserves selected listener, gender, language and locked session caps', () => {
  assert.match(talk, /listenerId: selected\.id/);
  assert.match(talk, /listenerGender: selected\.gender/);
  assert.match(talk, /languageCode: callLanguageCode/);
  assert.match(talk, /\(\[600, 1800, 3600\] as const\)/);
  assert.match(talk, /<CallCostQuote maxSeconds=\{capSeconds\}/);
  assert.match(callRoutes, /\(\$5::uuid IS NULL OR lp\.user_id=\$5::uuid\)/);
  assert.match(callRoutes, /\(\$6::text='any' OR lp\.gender::text=\$6\)/);
  assert.match(callRoutes, /JOIN app\.listener_languages/);
});

test('booking is timezone-explicit, deferred-price truthful and re-quotes before the reserved call starts', () => {
  assert.match(booking, /resolvedOptions\(\)\.timeZone/);
  assert.match(booking, /new Date\(scheduledLocal\)\.toISOString\(\)/);
  assert.match(booking, /<CallCostQuote maxSeconds=\{maxSeconds\} deferred/);
  assert.match(quote, /ثبت رزرو الآن مبلغی نگه نمی‌دارد/);
  assert.match(bookingCall, /<CallCostQuote bookingId=\{bookingId\} callId=\{existingCallId\}/);
  assert.match(quote, /getJson<BookingResponse>\('bookings'\)/);
  assert.match(quote, /getJson<CallResponse>\(`calls\/\$\{callId\}`\)/);
  assert.match(quote, /این تماس قبلاً ایجاد شده/);
});

test('no-answer state releases the hold, auto-offlines listener and returns alternatives', () => {
  assert.match(noAnswer, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.match(noAnswer, /'internet_voice_no_answer'/);
  assert.match(noAnswer, /SET status='offline'/);
  assert.match(noAnswer, /listenerAutoOffline: true/);
  assert.match(noAnswer, /alternativesAvailable: true/);
  assert.match(noAnswer, /chargedMinor: 0/);
  assert.match(talk, /این شنونده الان پاسخگو نیست/);
  assert.match(talk, /یک شنونده دیگه انتخاب کنی/);
  assert.match(talk, /refreshMarketplace\(\)/);
});

test('actual connected-time settlement consumes only charge and releases the unused hold', () => {
  assert.match(settlement, /LEAST\(now\(\), COALESCE\(\$2::timestamptz, now\(\)\)\) - connected_at/);
  assert.match(settlement, /boundedConnectedSeconds/);
  assert.match(settlement, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.match(settlement, /unusedHold = authorized - charge/);
  assert.match(settlement, /'unused_session_hold'/);
  assert.match(settlement, /'actual_connected_time_charge'/);
});

test('profile copy distinguishes verified identity from listener-written claims', () => {
  assert.match(talk, /هویت تأیید شده/);
  assert.match(talk, /این معرفی را خود شنونده نوشته است/);
  assert.match(talk, /توسط یکی هست راستی‌آزمایی نشده است/);
  assert.match(booking, /هویت تأیید شده/);
  assert.match(booking, /توسط یکی هست راستی‌آزمایی نشده است/);
});

test('normal and safety-ended calls expose report flow and repeat path without inventing rating or favorite APIs', () => {
  assert.match(talk, /بعد از گفت‌وگو/);
  assert.match(talk, /<ReportPanel callId=\{callId\} endpoint="safety\/report" ended/);
  assert.match(talk, /دوباره با \{selected\.nickname\} گفت‌وگو کن/);
  assert.match(bookingCall, /اگر در این گفت‌وگو مشکلی پیش آمد/);
  assert.match(bookingCall, /<ReportPanel callId=\{callId\} endpoint="safety\/report" ended/);
});
