import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// W57: the dev SMS/Email/Telephony providers and the OTP devCode exposure are allowed to
// widen from "NODE_ENV=development only" to "NODE_ENV=development OR Owner Internal Beta
// Preview mode", because Vercel Preview deployments run with NODE_ENV=production too.
// isInternalOwnerTestMode() (services/api/src/lib/internal-owner-test.ts) is the existing,
// already-audited (tests/internal-owner-test-mode.test.ts) fail-closed gate: it always
// returns false when VERCEL_ENV=production, so every one of these widenings is provably
// inert in real Production regardless of any other env var.

const sms = await readFile(new URL('../services/api/src/providers/sms.ts', import.meta.url), 'utf8');
const email = await readFile(new URL('../services/api/src/providers/email.ts', import.meta.url), 'utf8');
const telephony = await readFile(new URL('../services/api/src/providers/telephony.ts', import.meta.url), 'utf8');
const authRoute = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const authEmailRoute = await readFile(new URL('../services/api/src/routes/auth-email.ts', import.meta.url), 'utf8');

for (const [name, source] of [
  ['sms', sms],
  ['email', email],
  ['telephony', telephony],
  ['auth (phone OTP devCode)', authRoute],
  ['auth-email (email OTP devCode)', authEmailRoute],
] as const) {
  test(`${name} provider dev-mode widening is always gated by isInternalOwnerTestMode()`, () => {
    assert.match(source, /isInternalOwnerTestMode\(\)/);
    assert.match(source, /import \{ isInternalOwnerTestMode \} from '\.\.\/lib\/internal-owner-test\.ts';/);
  });
}

test('dev SMS provider still requires NODE_ENV=development or Owner Internal Beta mode, never bare production', () => {
  assert.match(sms, /process\.env\.NODE_ENV !== 'development' && !ownerTestMode/);
});

test('dev email provider still requires isInternalOwnerTestMode() to run in a NODE_ENV=production process', () => {
  assert.match(email, /process\.env\.NODE_ENV === 'production' && !isInternalOwnerTestMode\(\)/);
});

test('dev telephony provider still requires isInternalOwnerTestMode() to run in a NODE_ENV=production process', () => {
  assert.match(telephony, /process\.env\.NODE_ENV === 'production' && !isInternalOwnerTestMode\(\)/);
});

test('OTP devCode exposure still requires DEV_EXPOSE_OTP=true on top of the environment check', () => {
  for (const source of [authRoute, authEmailRoute]) {
    assert.match(source, /\(process\.env\.NODE_ENV === 'development' \|\| isInternalOwnerTestMode\(\)\) && process\.env\.DEV_EXPOSE_OTP === 'true'/);
  }
});
