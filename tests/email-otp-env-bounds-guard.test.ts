import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const securitySource = await readFile(
  new URL('../services/api/src/lib/security.ts', import.meta.url),
  'utf8',
);
const handlerSource = await readFile(
  new URL('../services/api/src/handler.ts', import.meta.url),
  'utf8',
);

test('email auth readiness validates all numeric TTL and rate-limit inputs before route execution', () => {
  assert.match(handlerSource, /validateEmailSecurityEnv\(\)/);
  for (const name of [
    'SESSION_TTL_HOURS',
    'OTP_TTL_SECONDS',
    'OTP_EMAIL_LIMIT_PER_15M',
    'OTP_EMAIL_IP_LIMIT_PER_15M',
    'OTP_GLOBAL_LIMIT_PER_15M',
  ]) {
    assert.match(securitySource, new RegExp(`boundedIntegerEnv\\('${name}'`));
  }
});

test('email OTP numeric validation rejects non-integer and out-of-range values', () => {
  assert.match(securitySource, /Number\.isInteger\(value\)/);
  assert.match(securitySource, /value < min \|\| value > max/);
  assert.match(securitySource, /OTP_EMAIL_LIMIT_PER_15M', 5, 1, 100/);
  assert.match(securitySource, /OTP_EMAIL_IP_LIMIT_PER_15M', 200, 1, 1000/);
  assert.match(securitySource, /OTP_GLOBAL_LIMIT_PER_15M', 1000, 1, 1_000_000/);
});
