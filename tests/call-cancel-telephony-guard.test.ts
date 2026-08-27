import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('caller cancellation keeps provider bridge private', () => {
  assert.match(source, /provider_bridge_id/);
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  assert.doesNotMatch(cancelSection, /providerBridgeId\s*:/);
  assert.match(cancelSection, /sendJson\(res, 200, \{ ok: true, callId, status: finalized\.status, idempotent: finalized\.idempotent \}\)/);
});

test('provider termination uses a durable started marker before external side effect', () => {
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  const started = cancelSection.indexOf('cancel_termination_started');
  const terminate = cancelSection.indexOf("await preparation.telephony.terminateCall(preparation.providerBridgeId, 'caller_cancelled')");
  assert.ok(started >= 0 && terminate > started);
});

test('confirmed provider termination is recorded before reservation release and terminal mutation', () => {
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  const terminate = cancelSection.indexOf("await preparation.telephony.terminateCall(preparation.providerBridgeId, 'caller_cancelled')");
  const confirmed = cancelSection.indexOf('cancel_termination_confirmed', terminate);
  const release = cancelSection.indexOf('reserved_minor=reserved_minor-$3::bigint', confirmed);
  const terminal = cancelSection.indexOf("SET status='cancelled'", release);
  assert.ok(terminate >= 0 && confirmed > terminate && release > confirmed && terminal > release);
});

test('ambiguous provider termination records reconciliation state without releasing funds or marking terminal', () => {
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  const terminate = cancelSection.indexOf("await preparation.telephony.terminateCall(preparation.providerBridgeId, 'caller_cancelled')");
  const catchIndex = cancelSection.indexOf('} catch {', terminate);
  const pendingError = cancelSection.indexOf("throw new HttpError(502, 'telephony_termination_pending')", catchIndex);
  assert.ok(terminate >= 0 && catchIndex > terminate && pendingError > catchIndex);
  const ambiguous = cancelSection.slice(catchIndex, pendingError + 80);
  assert.match(ambiguous, /cancel_termination_result_uncertain/);
  assert.doesNotMatch(ambiguous, /reserved_minor=reserved_minor-/);
  assert.doesNotMatch(ambiguous, /SET status='cancelled'/);
});

test('started or uncertain termination without confirmation blocks blind provider retry', () => {
  assert.match(source, /reasons\.has\('cancel_termination_result_uncertain'\) \|\| reasons\.has\('cancel_termination_started'\)/);
  assert.match(source, /throw new HttpError\(409, 'telephony_termination_reconcile_required'\)/);
  const priorCheck = source.indexOf("reasons.has('cancel_termination_result_uncertain')");
  const providerCall = source.indexOf("await preparation.telephony.terminateCall(preparation.providerBridgeId, 'caller_cancelled')", priorCheck);
  assert.ok(priorCheck >= 0 && providerCall > priorCheck);
});

test('confirmed termination retry skips provider and proceeds to local finalization only', () => {
  assert.match(source, /reasons\.has\('cancel_termination_confirmed'\)/);
  assert.match(source, /kind: 'provider_confirmed'/);
  assert.match(source, /metadata->>'reason'='cancel_termination_confirmed'/);
  const confirmedBranch = source.slice(
    source.indexOf("if (reasons.has('cancel_termination_confirmed'))"),
    source.indexOf("if (reasons.has('cancel_termination_result_uncertain')"),
  );
  assert.doesNotMatch(confirmedBranch, /terminateCall/);
});

test('already-cancelled retry is idempotent and never re-enters provider termination', () => {
  const preparationBranch = source.match(/if \(row\.status === 'cancelled'\) \{\n      return \{ kind: 'already_cancelled' as const \};\n    \}/)?.[0] ?? '';
  assert.match(preparationBranch, /already_cancelled/);
  assert.match(source, /preparation\.kind === 'already_cancelled'/);
  assert.match(source, /status: 'cancelled', idempotent: true/);
});

test('provider configuration failure occurs before termination marker or financial mutation', () => {
  const cancelSection = source.slice(source.indexOf('export async function cancelCall'));
  const preflight = cancelSection.indexOf('telephony = getTelephonyProvider()');
  const startedInsert = cancelSection.indexOf("jsonb_build_object('reason','cancel_termination_started')", preflight);
  const release = cancelSection.indexOf('reserved_minor=reserved_minor-$3::bigint');
  assert.ok(preflight >= 0 && startedInsert > preflight && release > startedInsert);
  const preflightSection = cancelSection.slice(preflight, startedInsert);
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
