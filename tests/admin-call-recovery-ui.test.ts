import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../apps/admin/app/calls/page.tsx', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../apps/admin/app/api/ops/[...path]/route.ts', import.meta.url), 'utf8');

test('admin calls UI loads anomaly diagnostics alongside the call queue', () => {
  assert.match(page, /\/api\/ops\/calls\?anomalies=true/);
  assert.match(page, /missingBridge/);
  assert.match(page, /stalePreconnect/);
  assert.match(page, /connectedOverrun/);
  assert.match(page, /underReservedWallets/);
});

test('admin recovery action is offered only for stale routing calls', () => {
  assert.match(page, /item\.status === 'routing'/);
  assert.match(page, /call\.status === 'routing' && recoverableCallIds\.has\(call\.id\)/);
  assert.doesNotMatch(page, /call\.status === 'calling_caller' && recoverableCallIds/);
  assert.doesNotMatch(page, /call\.status === 'connected' && recoverableCallIds/);
});

test('admin recovery UI uses the authenticated admin proxy POST path', () => {
  assert.match(page, /recover-stale-routing/);
  assert.match(page, /method: 'POST'/);
  assert.match(proxy, /export async function POST/);
  assert.match(proxy, /authorization: `Bearer \$\{token\}`/);
});
