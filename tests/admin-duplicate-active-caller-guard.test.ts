import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');

test('admin diagnostics surface callers with more than one active call', () => {
  assert.match(anomalies, /const duplicateActiveCallers = await query/);
  assert.match(anomalies, /GROUP BY caller_user_id/);
  assert.match(anomalies, /HAVING COUNT\(\*\) > 1/);
  assert.match(anomalies, /ARRAY_AGG\(id::text ORDER BY requested_at ASC\) AS call_ids/);
  assert.match(anomalies, /duplicateActiveCallers:/);
  assert.match(anomalies, /activeCallCount: row\.active_call_count/);
  assert.match(anomalies, /callIds: row\.call_ids/);
});

test('duplicate active caller diagnostic does not expose bridge ids or secrets', () => {
  assert.match(anomalies, /providerBridgeIdsIncluded: false/);
  assert.match(anomalies, /secretsIncluded: false/);
});
