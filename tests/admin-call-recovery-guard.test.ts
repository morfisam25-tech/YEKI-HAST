import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const recovery = await readFile(new URL('../services/api/src/routes/admin-call-recovery.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');

const exactTerminationReasons = [
  'cancel_termination_started',
  'cancel_termination_result_uncertain',
  'cancel_termination_confirmed',
  'safety_termination_started',
  'safety_termination_result_uncertain',
  'safety_termination_confirmed',
];

test('stale call recovery is admin-only and limited to routing before any bridge or connection', () => {
  assert.match(recovery, /await requireAdmin\(req\)/);
  assert.match(recovery, /row\.status !== 'routing'/);
  assert.match(recovery, /row\.provider_bridge_id !== null \|\| row\.connected_at !== null/);
  assert.match(recovery, /call_recovery_not_safe/);
  assert.doesNotMatch(recovery, /terminateCall\(/);
});

test('stale routing recovery refuses any durable termination intent before releasing funds', () => {
  assert.match(recovery, /metadata->>'reason' = ANY\(\$2::text\[\]\)/);
  assert.match(recovery, /call_termination_in_progress/);
  assert.doesNotMatch(recovery, /metadata->>'reason' LIKE/);
  for (const reason of exactTerminationReasons) assert.match(recovery, new RegExp(reason));
  const terminationCheck = recovery.indexOf('const termination = await client.query');
  const release = recovery.indexOf('SET reserved_minor=reserved_minor-');
  assert.ok(terminationCheck >= 0 && release > terminationCheck);
});

test('stale routing recovery uses database time and refuses fresh calls', () => {
  assert.match(recovery, /updated_at < now\(\) - \(\$2::int \* interval '1 minute'\)/);
  assert.match(recovery, /ROUTING_STALE_MINUTES = 5/);
  assert.match(recovery, /call_not_stale/);
});

test('reservation release and terminal transition are atomic and conflict-safe', () => {
  assert.match(recovery, /withTransaction/);
  assert.match(recovery, /FOR UPDATE/);
  assert.match(recovery, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.match(recovery, /reserved_minor >= \$3::bigint/);
  assert.match(recovery, /wallet_release_conflict/);
  assert.match(recovery, /ended_reason='admin_stale_routing_recovery'/);
  assert.match(recovery, /INSERT INTO app\.call_events/);
  assert.match(recovery, /INSERT INTO app\.audit_logs/);
});

test('recovery is idempotent only for calls previously recovered by this operation', () => {
  assert.match(recovery, /row\.status === 'failed' && row\.ended_reason === 'admin_stale_routing_recovery'/);
  assert.match(recovery, /idempotent: true/);
});

test('admin recovery route stays inside admin namespace', () => {
  assert.match(handler, /\/v1\\\/admin\\\/calls\\\/\(\[\^\/\]\+\)\\\/recover-stale-routing/);
  assert.match(handler, /recoverStaleRoutingCall/);
});
