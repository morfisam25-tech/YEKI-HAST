import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');

test('admin bootstrap is disabled unless explicitly enabled', () => {
  assert.match(source, /BOOTSTRAP_ADMIN_ENABLED/);
  assert.match(source, /!== 'true'/);
});

test('admin bootstrap requires the configured verified phone', () => {
  assert.match(source, /BOOTSTRAP_ADMIN_PHONE_E164/);
  assert.match(source, /configuredPhone !== verifiedPhoneE164/);
  assert.match(source, /maybeBootstrapFirstAdmin\(client, userId, phoneE164\)/);
});

test('admin bootstrap happens only after successful OTP consumption and user resolution', () => {
  const consume = source.indexOf('consumed_at=now()');
  const bootstrap = source.indexOf('maybeBootstrapFirstAdmin(client, userId, phoneE164)');
  assert.ok(consume >= 0 && bootstrap > consume);
});

test('admin bootstrap cannot create a second or repeat bootstrap admin', () => {
  assert.match(source, /SELECT 1 FROM app\.admin_users LIMIT 1/);
  assert.match(source, /admin_bootstrap_completed/);
  assert.match(source, /pg_advisory_xact_lock/);
});

test('admin bootstrap writes an audit record and never bypasses OTP', () => {
  assert.match(source, /INSERT INTO app\.audit_logs/);
  assert.match(source, /'verified_otp'/);
  assert.doesNotMatch(source, /DEV_EXPOSE_OTP.*BOOTSTRAP_ADMIN/s);
});
