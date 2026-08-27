import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('caller cancellation keeps provider bridge private', () => {
  assert.match(source, /provider_bridge_id/);
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  assert.doesNotMatch(cancelSection, /providerBridgeId\s*:/);
  assert.doesNotMatch(cancelSection, /provider_bridge_id\s*[,}]/);
});

test('confirmed provider termination happens before reservation release and terminal mutation', () => {
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  const terminate = cancelSection.indexOf("await telephony.terminateCall(row.provider_bridge_id, 'caller_cancelled')");
  const release = cancelSection.indexOf('reserved_minor=reserved_minor-$3::bigint');
  const terminal = cancelSection.indexOf("SET status='cancelled'");
  assert.ok(terminate >= 0 && release > terminate && terminal > release);
});

test('ambiguous provider termination records reconciliation state without releasing funds or marking terminal', () => {
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  const terminate = cancelSection.indexOf("await telephony.terminateCall(row.provider_bridge_id, 'caller_cancelled')");
  const catchIndex = cancelSection.indexOf('} catch {', terminate);
  const ambiguousReturn = cancelSection.indexOf("return { kind: 'termination_uncertain'", catchIndex);
  assert.ok(terminate >= 0 && catchIndex > terminate && ambiguousReturn > catchIndex);
  const ambiguous = cancelSection.slice(catchIndex, ambiguousReturn + 120);
  assert.match(ambiguous, /cancel_termination_result_uncertain/);
  assert.doesNotMatch(ambiguous, /reserved_minor=reserved_minor-/);
  assert.doesNotMatch(ambiguous, /SET status='cancelled'/);
  assert.match(cancelSection, /throw new HttpError\(502, 'telephony_termination_pending'\)/);
});

test('a prior uncertain termination blocks blind provider retry', () => {
  assert.match(source, /metadata->>'reason'='cancel_termination_result_uncertain'/);
  assert.match(source, /throw new HttpError\(409, 'telephony_termination_reconcile_required'\)/);
  const priorCheck = source.indexOf("metadata->>'reason'='cancel_termination_result_uncertain'");
  const providerCall = source.indexOf("await telephony.terminateCall(row.provider_bridge_id, 'caller_cancelled')", priorCheck);
  assert.ok(priorCheck >= 0 && providerCall > priorCheck);
});

test('already-cancelled retry does not call provider or release reservation again', () => {
  const branch = source.match(/if \(row\.status === 'cancelled'\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
  assert.match(branch, /idempotent: true/);
  assert.doesNotMatch(branch, /terminateCall/);
  assert.doesNotMatch(branch, /reserved_minor/);
});

test('provider configuration failure occurs before cancellation financial mutation', () => {
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  const preflight = cancelSection.indexOf('telephony = getTelephonyProvider()');
  const release = cancelSection.indexOf('reserved_minor=reserved_minor-$3::bigint');
  assert.ok(preflight >= 0 && release > preflight);
  const preflightSection = cancelSection.slice(preflight, release);
  assert.match(preflightSection, /telephony_not_configured/);
});

test('cancellation cannot release reservation while dispatch result is unresolved', () => {
  const uncertainIndex = source.indexOf("row.status === 'calling_caller' && !row.provider_bridge_id");
  const releaseIndex = source.indexOf('reserved_minor=reserved_minor-$3::bigint', uncertainIndex);
  assert.ok(uncertainIndex >= 0 && releaseIndex > uncertainIndex);
  assert.match(source, /throw new HttpError\(409, 'telephony_dispatch_uncertain'\)/);
  assert.match(source, /\(row\.status === 'caller_answered' \|\| row\.status === 'calling_listener'\) && !row\.provider_bridge_id/);
  assert.match(source, /throw new HttpError\(409, 'call_telephony_invariant'\)/);
});
