import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const phoneSource = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const emailSource = await readFile(new URL('../services/api/src/routes/auth-email.ts', import.meta.url), 'utf8');
const verifierSource = await readFile(new URL('../scripts/verify-production-security-config.mjs', import.meta.url), 'utf8');

test('admin bootstrap is disabled unless explicitly enabled', () => {
  assert.match(phoneSource, /BOOTSTRAP_ADMIN_ENABLED/);
  assert.match(phoneSource, /!== 'true'/);
  assert.match(emailSource, /BOOTSTRAP_ADMIN_ENABLED/);
  assert.match(emailSource, /!== 'true'/);
});

test('phone admin bootstrap requires the configured verified phone', () => {
  assert.match(phoneSource, /BOOTSTRAP_ADMIN_PHONE_E164/);
  assert.match(phoneSource, /configuredPhone !== verifiedPhoneE164/);
  assert.match(phoneSource, /maybeBootstrapFirstAdmin\(client, userId, phoneE164\)/);
});

test('email-first admin bootstrap requires the configured verified email', () => {
  assert.match(emailSource, /BOOTSTRAP_ADMIN_EMAIL/);
  assert.match(emailSource, /normalizeEmailAddress\(configuredRaw\)/);
  assert.match(emailSource, /configuredEmail !== verifiedEmail/);
  assert.match(emailSource, /maybeBootstrapFirstAdminByEmail\(client, userId, email\)/);
});

test('admin bootstrap happens only after successful OTP consumption and user resolution', () => {
  const phoneConsume = phoneSource.indexOf('consumed_at=now()');
  const phoneBootstrap = phoneSource.indexOf('maybeBootstrapFirstAdmin(client, userId, phoneE164)');
  assert.ok(phoneConsume >= 0 && phoneBootstrap > phoneConsume);

  const emailConsume = emailSource.indexOf('consumed_at=now()');
  const emailBootstrap = emailSource.indexOf('maybeBootstrapFirstAdminByEmail(client, userId, email)');
  assert.ok(emailConsume >= 0 && emailBootstrap > emailConsume);
});

test('admin bootstrap cannot create a second or repeat bootstrap admin', () => {
  for (const source of [phoneSource, emailSource]) {
    assert.match(source, /SELECT 1 FROM app\.admin_users LIMIT 1/);
    assert.match(source, /admin_bootstrap_completed/);
    assert.match(source, /pg_advisory_xact_lock/);
  }
});

test('admin bootstrap writes an audit record and never bypasses OTP', () => {
  assert.match(phoneSource, /INSERT INTO app\.audit_logs/);
  assert.match(phoneSource, /'verified_otp'/);
  assert.doesNotMatch(phoneSource, /DEV_EXPOSE_OTP.*BOOTSTRAP_ADMIN/s);

  assert.match(emailSource, /INSERT INTO app\.audit_logs/);
  assert.match(emailSource, /'verified_email_otp'/);
  assert.doesNotMatch(emailSource, /DEV_EXPOSE_OTP.*BOOTSTRAP_ADMIN/s);
});

test('production verifier allows exactly one temporary bootstrap identity and requires cleanup after disable', () => {
  assert.match(verifierSource, /configuredIdentityCount !== 1/);
  assert.match(verifierSource, /Exactly one bootstrap admin identity/);
  assert.match(verifierSource, /Bootstrap admin identity must be removed/);
  assert.match(verifierSource, /emailAddress\('BOOTSTRAP_ADMIN_EMAIL'\)/);
  assert.match(verifierSource, /e164\('BOOTSTRAP_ADMIN_PHONE_E164'\)/);
});
