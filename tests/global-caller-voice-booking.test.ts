import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function consumerRender(text: string): string {
  const marker = text.lastIndexOf('\n  return (\n    <main');
  return marker >= 0 ? text.slice(marker) : text;
}

const backendReportCategories = [
  'sexual_behavior',
  'harassment',
  'insult',
  'threat',
  'off_platform_request',
  'privacy_violation',
  'scam',
  'unsafe_advice',
  'inappropriate_conduct',
  'technical_problem',
  'other',
];

test('Booking records all required caller consents before creating a reservation', async () => {
  const booking = await source('apps/web/app/booking/page.tsx');
  assert.match(booking, /const policiesReady = ageConfirmed && termsAccepted && safetyAccepted/);
  assert.match(booking, /if \(!selected \|\| !selectedWindow \|\| !scheduledLocal \|\| !policiesReady \|\| busy\) return/);
  assert.match(booking, /JSON\.stringify\(\{ confirmed: true, termsAccepted: true, safetyAccepted: true \}\)/);
  assert.doesNotMatch(booking, /JSON\.stringify\(\{ confirmed: true \}\)/);
  assert.match(booking, /disabled=\{busy \|\| !policiesReady \|\| !clientTimeFits\(\)\}/);
  assert.match(booking, /href="\/terms"/);
  assert.match(booking, /عدم تبادل اطلاعات تماس شخصی/);
});

test('Caller request stores the selected Listener gender rather than a contradictory any value', async () => {
  const talk = await source('apps/web/app/talk/page.tsx');
  assert.match(talk, /listenerGender: selected\.gender/);
  assert.doesNotMatch(talk, /listenerGender: 'any'/);
  assert.match(talk, /genderFilter/);
  assert.match(talk, /languageFilter/);
});

test('Talk and reserved Call use the real safety report contract with exact backend categories', async () => {
  const talk = await source('apps/web/app/talk/page.tsx');
  const call = await source('apps/web/app/booking/call/page.tsx');
  const report = await source('apps/web/components/caller/ReportPanel.tsx');

  assert.match(talk, /ReportPanel callId=\{callId\} endpoint="safety\/report"/);
  assert.match(call, /ReportPanel callId=\{callId\} endpoint="safety\/report"/);
  assert.match(report, /fetch\(`\/api\/caller\/\$\{endpoint\}`/);
  assert.match(report, /callId,\s*category,\s*details: details\.trim\(\) \|\| undefined,\s*blockCounterparty/s);
  assert.match(report, /maxLength=\{4000\}/);

  const values = [...report.matchAll(/\{ value: '([^']+)', label:/g)].map((match) => match[1]);
  assert.deepEqual(values, backendReportCategories);
  assert.match(report, /هم‌زمان این شنونده را مسدود کن/);
  assert.match(report, /گزارش ثبت شد\./);
});

test('Safety exit remains independent from Report and always supports immediate blocking', async () => {
  const talk = await source('apps/web/app/talk/page.tsx');
  const call = await source('apps/web/app/booking/call/page.tsx');
  const report = await source('apps/web/components/caller/ReportPanel.tsx');

  for (const page of [talk, call]) {
    assert.match(page, /finish\(path: 'end' \| 'safety-exit'\)/);
    assert.match(page, /blockCounterparty: true/);
    assert.match(page, /خروج فوری و مسدودکردن/);
    assert.match(page, /ReportPanel/);
  }
  assert.match(report, /blockCounterparty/);
  assert.match(report, /useState\(false\)/);
  assert.doesNotMatch(report, /voice\/end|voice\/safety-exit/);
});

test('Reserved Call implements connected heartbeat parity and server-authoritative terminal timing', async () => {
  const call = await source('apps/web/app/booking/call/page.tsx');
  assert.match(call, /phase !== 'connected' \|\| !callId/);
  assert.match(call, /calls\/\$\{callId\}\/voice\/heartbeat/);
  assert.match(call, /method: 'POST'/);
  assert.match(call, /setInterval\(\(\) => void heartbeat\(\), 5_000\)/);
  assert.match(call, /result\.timing\.remainingSeconds/);
  assert.match(call, /result\.timing\.warning/);
  assert.match(call, /result\.terminal/);
  assert.match(call, /result\.capReached/);
  assert.match(call, /cleanup\(\)/);
});

test('Report and live state are keyboard and assistive-technology accessible', async () => {
  const talk = await source('apps/web/app/talk/page.tsx');
  const call = await source('apps/web/app/booking/call/page.tsx');
  const report = await source('apps/web/components/caller/ReportPanel.tsx');
  const talkCss = await source('apps/web/app/talk/talk.module.css');
  const bookingCss = await source('apps/web/app/booking/booking.module.css');

  assert.match(report, /<label htmlFor=\{categoryId\}>/);
  assert.match(report, /<label htmlFor=\{detailsId\}>/);
  assert.match(report, /<label htmlFor=\{blockId\} data-report-block>/);
  assert.match(report, /role="alert"/);
  assert.match(report, /role="status" aria-live="polite"/);
  assert.match(talk, /role="status"\s*aria-live="polite"\s*aria-atomic="true"/s);
  assert.match(call, /role="status"\s*aria-live="polite"\s*aria-atomic="true"/s);
  assert.match(talkCss, /:focus-visible/);
  assert.match(bookingCss, /:focus-visible/);
});

test('consumer rendering keeps human language, real trust signals, timezone and no technical jargon', async () => {
  const talk = await source('apps/web/app/talk/page.tsx');
  const booking = await source('apps/web/app/booking/page.tsx');
  const call = await source('apps/web/app/booking/call/page.tsx');
  const report = await source('apps/web/components/caller/ReportPanel.tsx');

  assert.match(talk, /هویت تأیید شده/);
  assert.match(talk, /این معرفی را خود شنونده نوشته است/);
  assert.match(talk, /هزینه فقط از زمان اتصال واقعی محاسبه می‌شود/);
  assert.match(talk, /مبلغی از اعتبارت کم نشده/);
  assert.match(talk, /یک شنونده دیگه انتخاب کنی/);
  assert.match(booking, /resolvedOptions\(\)\.timeZone/);
  assert.match(booking, /برنامه‌ریزی‌شده/);
  assert.match(booking, /تماس شروع شده/);
  assert.match(booking, /لغوشده/);
  assert.match(booking, /از دست‌رفته/);
  assert.match(booking, /تا وقتی رزرو شروع نشده/);
  assert.match(booking, /bookings\/\$\{id\}\/cancel/);

  for (const render of [consumerRender(talk), consumerRender(booking), consumerRender(call), report]) {
    assert.doesNotMatch(render, /\bWebRTC\b|\bICE\b|\brelay\b|HOLD/i);
  }
});
