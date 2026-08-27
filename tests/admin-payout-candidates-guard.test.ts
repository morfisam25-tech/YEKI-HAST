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

test('pending earnings are visible only as a separate read-only backlog', () => {
  assert.match(route, /WHERE e\.status='pending'/);
  assert.match(route, /pendingEarningBacklog:/);
  assert.match(route, /COUNT\(DISTINCT e\.listener_user_id\)::text AS listener_count/);
  assert.match(page, /درآمدهای هنوز آزاد‌نشده/);
  assert.match(page, /از این بخش هیچ earning آزاد، payout-ready یا پرداخت نمی‌شود/);
  assert.match(page, /HOLD/);
});

test('candidate response stays operational and excludes bank details and provider references', () => {
  assert.match(route, /payoutCandidates:/);
  assert.match(route, /candidateVersion:/);
  assert.match(route, /providerReferencesIncluded: false/);
  assert.match(route, /bankDetailsIncluded: false/);
});

test('admin candidate UI can prepare available earnings without inventing release policy', () => {
  assert.match(page, /Prepare payout/);
  assert.match(page, /`pending` دست نمی‌خورد/);
  assert.match(page, /هیچ provider call یا انتقال بانکی انجام نمی‌شود/);
  assert.match(page, /expectedAvailableMinor: candidate\.availableMinor/);
  assert.match(page, /expectedEarningCount: candidate\.earningCount/);
  assert.match(page, /candidateVersion: candidate\.candidateVersion/);
  assert.doesNotMatch(page, /releaseEarning|markAvailable/);
});
