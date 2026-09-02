import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const provider = await readFile(new URL('../services/api/src/providers/email.ts', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');

const mailbox = 'sales@uniqueholding.com.tr';

test('technical beta source-locks delegated Gmail API transport to the Workspace mailbox', () => {
  assert.match(envSync, /const DEFAULT_MAILBOX_EMAIL = 'sales@uniqueholding\.com\.tr'/);
  assert.match(envSync, /const GOOGLE_TOKEN_URL = 'https:\/\/oauth2\.googleapis\.com\/token'/);
  assert.match(envSync, /requiredMultiline\('PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON'\)/);
  assert.match(envSync, /validateServiceAccountJson\(gmailServiceAccountJson\)/);
  assert.match(envSync, /setPlain\('EMAIL_PROVIDER', 'gmail_api'\)/);
  assert.match(envSync, /setSensitive\('GMAIL_SERVICE_ACCOUNT_JSON', gmailServiceAccountJson\)/);
  assert.match(envSync, /setPlain\('GMAIL_IMPERSONATED_USER', gmailImpersonatedUser\)/);
  assert.match(envSync, /setPlain\('GMAIL_FROM_EMAIL', gmailFromEmail\)/);
  assert.match(envSync, new RegExp(mailbox.replaceAll('.', '\\.')));
  assert.doesNotMatch(envSync, /smtp\.gmail\.com|PRODUCTION_SMTP_PASSWORD|setSensitive\('SMTP_PASSWORD'/);
});

test('runtime Gmail credential cannot redirect OAuth or mail delivery away from Google', () => {
  assert.match(provider, /const GOOGLE_TOKEN_URL = 'https:\/\/oauth2\.googleapis\.com\/token'/);
  assert.match(provider, /const GMAIL_SEND_URL = 'https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send'/);
  assert.match(provider, /tokenUri !== GOOGLE_TOKEN_URL/);
  assert.match(provider, /GMAIL_SEND_SCOPE/);
  assert.match(provider, /production Gmail identity is not approved/);
  assert.doesNotMatch(provider, /process\.env\.(?:GOOGLE_TOKEN_URL|GMAIL_SEND_URL|GMAIL_SCOPE)/);
});

test('production API workflow requires the delegated Gmail credential instead of an App Password', () => {
  assert.match(workflow, /PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON \}\}/);
  assert.match(workflow, /VERCEL_TOKEN PRODUCTION_DATABASE_URL PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(workflow, /PRODUCTION_SMTP_PASSWORD/);
});
