import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../services/api/src/routes/admin-safety.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../apps/admin/app/safety/page.tsx', import.meta.url), 'utf8');

test('admin safety queue classifies two-phase termination without bridge identity', () => {
  for (const reason of [
    'safety_termination_started',
    'safety_termination_result_uncertain',
    'safety_termination_confirmed',
  ]) {
    assert.ok(backend.includes(reason));
  }
  for (const state of [
    'finalized',
    'confirmed_local_finalize_pending',
    'uncertain',
    'started_unresolved',
    'not_started',
  ]) {
    assert.ok(backend.includes(state));
  }
  assert.match(backend, /providerBridgeIdIncluded: false/);
  assert.doesNotMatch(backend, /SELECT[^;]*provider_bridge_id/i);
});

test('admin safety termination diagnostics never permit provider retry', () => {
  assert.match(backend, /providerTerminationRetryAllowed: row\.termination_state === null \? null : false/);
  assert.match(backend, /localFinalizeRetryAllowed: row\.termination_state === 'confirmed_local_finalize_pending'/);
  assert.match(backend, /terminationReconciliationRequired:/);
  assert.doesNotMatch(page, /terminateCall|providerTerminationRetryAllowed\s*===\s*true/);
});

test('admin safety UI makes reconcile and local-finalize states explicit without automatic repair', () => {
  assert.match(page, /confirmed_local_finalize_pending: 'LOCAL FINALIZE'/);
  assert.match(page, /uncertain: 'RECONCILE'/);
  assert.match(page, /started_unresolved: 'RECONCILE'/);
  assert.match(page, /provider termination را از این صف دوباره ارسال نکن/);
  assert.match(page, /فقط local finalization باقی مانده/);
  assert.doesNotMatch(page, /auto.?fix|auto.?repair/i);
});
