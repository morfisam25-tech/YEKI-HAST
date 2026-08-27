import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const screen = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');

test('caller active-call recovery is caller-scoped and limited to active states', () => {
  assert.match(calls, /export async function getActiveCall/);
  assert.match(calls, /WHERE caller_user_id=\$1 AND status::text = ANY\(\$2::text\[\]\)/);
  assert.match(calls, /ORDER BY requested_at DESC/);
  assert.match(calls, /LIMIT 2/);
  assert.match(calls, /if \(result\.rows\.length > 1\) throw new HttpError\(409, 'caller_active_call_conflict'\)/);
  assert.match(screen, /caller_active_call_conflict:/);
  assert.match(calls, /activeCall: null/);
  assert.match(handler, /url\.pathname === '\/v1\/calls\/active'/);
});

test('duplicate active-call recovery blocks new caller flow until reviewed', () => {
  assert.match(screen, /const \[recoveryBlocked, setRecoveryBlocked\] = useState\(false\)/);
  assert.match(screen, /if \(code === 'caller_active_call_conflict'\) setRecoveryBlocked\(true\)/);
  assert.match(screen, /if \(recoveryCode === 'caller_active_call_conflict'\) setRecoveryBlocked\(true\)/);
  assert.match(screen, /if \(recoveryBlocked\) return;/);
  assert.match(screen, /recoveryComplete && recoveryBlocked/);
  assert.match(screen, /recoveryComplete && !recoveryBlocked && stage === 'age-gate'/);
  assert.match(screen, /recoveryComplete && !recoveryBlocked && stage === 'browse'/);
  assert.match(screen, /شروع تماس جدید در این صفحه موقتاً بسته است/);
  assert.doesNotMatch(screen, /force-cancel|repair-conflict|resolve-conflict/);
});

test('new call creation serializes per caller and rejects a second active call', () => {
  assert.match(calls, /pg_advisory_xact_lock/);
  assert.match(calls, /yeki_hast:caller_active:/);
  assert.match(calls, /if \(existing\.rows\[0\]\) return \{ \.\.\.snapshotCall\(existing\.rows\[0\]\), idempotent: true \}/);
  assert.match(calls, /if \(active\.rows\[0\]\) throw new HttpError\(409, 'caller_call_already_active'\)/);
});

test('mobile reopens the server-side active call instead of creating a replacement call', () => {
  assert.match(api, /export function getActiveCall/);
  assert.match(api, /request\('\/v1\/calls\/active'/);
  assert.match(screen, /useEffect\(\(\) => \{/);
  assert.match(screen, /await getActiveCall\(token\)/);
  assert.match(screen, /setCall\(result\.activeCall\)/);
  assert.match(screen, /setStage\('call'\)/);
});

test('request race recovers the winning active call instead of leaving caller stranded', () => {
  assert.match(screen, /code === 'caller_call_already_active'/);
  assert.match(screen, /const recovered = await getActiveCall\(token\)/);
  assert.match(screen, /if \(recovered\.activeCall\)/);
  assert.match(screen, /setCall\(recovered\.activeCall\)/);
  assert.match(screen, /setStage\('call'\)/);
});

test('uncertain telephony dispatch keeps the caller on the same retryable call', () => {
  assert.match(screen, /telephony_dispatch_uncertain:/);
  assert.match(screen, /call\.status !== 'routing' && call\.status !== 'calling_caller'/);
  assert.match(screen, /call\.status === 'routing' \|\| call\.status === 'calling_caller'/);
  assert.match(screen, /ادامه همین تماس/);
});

test('live caller status auto-sync polls only non-terminal calls and cleans up its timer', () => {
  assert.match(screen, /const CALL_STATUS_POLL_MS = 3_000/);
  assert.match(screen, /stage !== 'call' \|\| !call \|\| terminalStatuses\.has\(call\.status\)/);
  assert.match(screen, /const next = await getCall\(token, callId\)/);
  assert.match(screen, /current\?\.callId === callId \? next : current/);
  assert.match(screen, /setInterval\(\(\) => \{ void syncLiveCall\(\); \}, CALL_STATUS_POLL_MS\)/);
  assert.match(screen, /clearInterval\(timer\)/);
  assert.match(screen, /getErrorCode\(cause\) !== 'network_error'/);
});

test('connected calls remain non-cancellable in caller UI while safety exit stays available', () => {
  assert.match(screen, /const cancellableStatuses = new Set\(\['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener'\]\)/);
  assert.doesNotMatch(screen, /cancellableStatuses[^\n]*connected/);
  assert.match(screen, /پایان فوری برای ایمنی/);
});
