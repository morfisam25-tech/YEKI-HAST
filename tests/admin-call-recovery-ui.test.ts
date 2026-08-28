import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../apps/admin/app/calls/page.tsx', import.meta.url), 'utf8');
const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../apps/admin/app/api/ops/[...path]/route.ts', import.meta.url), 'utf8');

test('admin calls UI loads anomaly diagnostics alongside the call queue', () => {
  assert.match(page, /\/api\/ops\/calls\?anomalies=true/);
  assert.match(page, /missingBridge/);
  assert.match(page, /stalePreconnect/);
  assert.match(page, /connectedOverrun/);
  assert.match(page, /underReservedWallets/);
});

test('admin recovery action uses backend-derived eligibility, not status alone', () => {
  assert.match(anomalies, /AS recovery_eligible/);
  assert.match(anomalies, /cs\.status::text='routing'/);
  assert.match(anomalies, /cs\.provider_bridge_id IS NULL/);
  assert.match(anomalies, /cs\.connected_at IS NULL/);
  assert.match(anomalies, /metadata->>'reason' = ANY\(\$2::text\[\]\)/);
  assert.match(anomalies, /recoveryEligible: row\.recovery_eligible/);
  assert.match(page, /recoveryEligible: boolean/);
  assert.match(page, /\.filter\(\(item\) => item\.recoveryEligible\)/);
  assert.match(page, /const canRecover = recoverableCallIds\.has\(call\.id\)/);
  assert.doesNotMatch(page, /\.filter\(\(item\) => item\.status === 'routing'\)/);
});

test('admin recovery UI uses the authenticated admin proxy POST path', () => {
  assert.match(page, /recover-stale-routing/);
  assert.match(page, /method: 'POST'/);
  assert.match(proxy, /export async function POST/);
  assert.match(proxy, /authorization: `Bearer \$\{token\}`/);
});
