import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layout = await readFile(new URL('../apps/web/app/listener/work/layout.tsx', import.meta.url), 'utf8');
const parity = await readFile(new URL('../apps/web/app/listener/work/ListenerReportParity.tsx', import.meta.url), 'utf8');
const panel = await readFile(new URL('../apps/web/components/listener/ReportPanel.tsx', import.meta.url), 'utf8');
const listenerPage = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');
const listenerProxy = await readFile(new URL('../apps/web/app/api/listener/[...path]/route.ts', import.meta.url), 'utf8');

test('Listener work route exposes report UI for active and actionable recent calls', () => {
  assert.match(layout, /<ListenerReportParity \/>/);
  assert.match(parity, /listener\/calls\/active/);
  assert.match(parity, /listener\/calls\/recent\?limit=8/);
  assert.match(parity, /counterpartyActionAvailable/);
  assert.match(parity, /<ListenerReportPanel callId=\{activeCallId\}/);
  assert.match(parity, /<ListenerReportPanel callId=\{call\.callId\} ended \/>/);
});

test('Listener report uses the Listener proxy, supports optional block and never pretends report ends a call', () => {
  assert.match(panel, /fetch\('\/api\/listener\/safety\/report'/);
  assert.match(panel, /blockCounterparty/);
  assert.match(panel, /گزارش، گفت‌وگو را خودکار پایان نمی‌دهد/);
  assert.match(panel, /هم‌زمان این کاربر را مسدود کن/);
  assert.match(listenerProxy, /safety\\\/\(report\|block\)/);
});

test('Listener keeps the separate immediate Safety Exit and block path', () => {
  assert.match(listenerPage, /web_listener_safety_exit/);
  assert.match(listenerPage, /blockCounterparty: true/);
  assert.match(listenerPage, /خروج برای ایمنی و مسدودکردن/);
});
