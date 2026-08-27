import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../services/api/src/routes/admin-payouts.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/payouts/page.tsx', import.meta.url), 'utf8');

test('payout candidates include only available listener earnings not already attached to a payout', () => {
  assert.match(route, /FROM app\.listener_earnings e/);
  assert.match(route, /LEFT JOIN app\.payout_items pi ON pi\.earning_id=e\.id/);
  assert.match(route, /WHERE e\.status='available' AND pi\.id IS NULL/);
  assert.match(route, /COALESCE\(SUM\(e\.amount_minor\),0\)::text AS available_minor/);
  assert.match(route, /COUNT\(\*\)::text AS earning_count/);
});

test('payout candidates stay separated by listener, market, and currency', () => {
  assert.match(route, /e\.market_id::text/);
  assert.match(route, /GROUP BY e\.listener_user_id, e\.market_id, e\.currency_code, k\.status/);
  assert.match(route, /marketId: row\.market_id/);
  assert.match(page, /marketId: string/);
  assert.match(page, /candidate\.listenerUserId}:\$\{candidate\.marketId}:\$\{candidate\.currencyCode/);
  assert.match(page, /candidate\.marketId\.slice\(0, 8\)/);
});

test('candidate response stays operational and excludes bank details and provider references', () => {
  assert.match(route, /payoutCandidates:/);
  assert.match(route, /providerReferencesIncluded: false/);
  assert.match(route, /bankDetailsIncluded: false/);
});

test('admin payout candidate UI is read-only and does not invent payout preparation policy', () => {
  assert.match(page, /درآمدهای available خارج از payout/);
  assert.match(page, /فقط read-only است/);
  assert.match(page, /`pending` را available نمی‌کند/);
  assert.doesNotMatch(page, /preparePayout|releaseEarning|markAvailable/);
});
