import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const contactRoute = await readFile(new URL('../services/api/src/routes/account-contact.ts', import.meta.url), 'utf8');
const adminContact = await readFile(new URL('../services/api/src/routes/admin-contact.ts', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');

test('call-phone collection is unavailable while Caller beta is closed', () => {
  assert.match(envSync, /setPlain\('CALLER_CLOSED_BETA_ENABLED', 'false'\)/);
  assert.match(contactRoute, /requireCallerClosedBetaEnabled/);
  const gate = contactRoute.indexOf('requireCallerClosedBetaEnabled();');
  const auth = contactRoute.indexOf('await requireAuth(req)', contactRoute.indexOf('export async function setCallPhone'));
  const body = contactRoute.indexOf('await readJson<', contactRoute.indexOf('export async function setCallPhone'));
  assert.ok(gate >= 0 && auth > gate && body > gate);
});

test('manual phone verification stays disabled in technical beta', () => {
  assert.match(envSync, /setPlain\('MANUAL_PHONE_VERIFICATION_BETA_ENABLED', 'false'\)/);
  assert.match(adminContact, /manual_phone_verification_disabled/);
  assert.match(adminContact, /if \(!manualBetaEnabled\(\)\) throw new HttpError\(503/);
});
