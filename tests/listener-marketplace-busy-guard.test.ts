import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const marketplace = await readFile(new URL('../services/api/src/routes/marketplace.ts', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('caller marketplace does not advertise a listener with an active call as available', () => {
  assert.match(marketplace, /const ACTIVE_CALL_STATUSES = \['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'\]/);
  assert.match(marketplace, /busy\.listener_user_id=lp\.user_id/);
  assert.match(marketplace, /busy\.status::text = ANY\(\$5::text\[\]\)/);
  assert.match(marketplace, /AND NOT EXISTS \([\s\S]*FROM app\.call_sessions busy[\s\S]*busy\.listener_user_id=lp\.user_id/);
});

test('non-online diagnostic browse marks active listeners busy instead of online', () => {
  assert.match(marketplace, /WHEN EXISTS \([\s\S]*FROM app\.call_sessions busy[\s\S]*\) THEN 'busy'/);
  assert.match(marketplace, /presence: row\.presence_status/);
});

test('marketplace busy definition stays aligned with call assignment busy definition', () => {
  for (const status of ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected']) {
    assert.ok(marketplace.includes(`'${status}'`));
    assert.ok(calls.includes(`'${status}'`));
  }
  assert.match(calls, /NOT EXISTS \([\s\S]*FROM app\.call_sessions busy[\s\S]*busy\.listener_user_id=lp\.user_id/);
});
