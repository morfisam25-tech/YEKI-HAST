import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const marketplace = await readFile(new URL('../services/api/src/routes/marketplace.ts', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const anomalies = await readFile(new URL('../services/api/src/routes/admin-call-anomalies.ts', import.meta.url), 'utf8');

test('marketplace excludes the authenticated caller from their own listener results', () => {
  assert.match(marketplace, /const \{ userId \} = await requireAuth\(req\)/);
  assert.match(marketplace, /lp\.user_id<>\$6::uuid/);
  assert.match(
    marketplace,
    /\[gender, language, onlineOnly, limit, ACTIVE_CALL_STATUSES, userId, productCode, serviceCode, marketCode,\s+isInternalOwnerTestCaller\(userId\), INTERNAL_OWNER_TEST_LISTENER_ID\]/,
  );
});

test('call assignment independently excludes caller identity even if marketplace is bypassed', () => {
  assert.match(calls, /WHERE lp\.is_verified=true[\s\S]*AND lp\.user_id<>\$8::uuid/);
  assert.match(calls, /listenerId, listenerGender, callerGender, userId, activeCallStatuses/);
});

test('self exclusion happens before wallet reservation and call insertion', () => {
  const exclusion = calls.indexOf('AND lp.user_id<>$8::uuid');
  const callInsert = calls.indexOf('INSERT INTO app.call_sessions');
  const reserve = calls.indexOf('SET reserved_minor=reserved_minor+');
  assert.ok(exclusion >= 0 && callInsert > exclusion && reserve > callInsert);
});

test('historical self-call records are surfaced as a read-only admin invariant', () => {
  assert.match(anomalies, /caller_user_id=listener_user_id THEN 'caller_listener_same_user'/);
  assert.match(anomalies, /listener_user_id IS NOT NULL AND caller_user_id=listener_user_id/);
  assert.match(anomalies, /diagnosticsReadOnly: true/);
  assert.doesNotMatch(anomalies, /SET\s+listener_user_id|DELETE\s+FROM\s+app\.call_sessions/i);
});
