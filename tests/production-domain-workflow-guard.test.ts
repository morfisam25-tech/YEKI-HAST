import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/configure-production-domains.yml', import.meta.url), 'utf8');

const teamId = 'team_GmseY3ibD05FWemVhLElL3hI';
const teamSlug = 'unique-6ff0';
const webProjectId = 'prj_afhSiMYpsCfIAxuOmotLAWBvTMDg';

function escaped(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

test('production domain configuration is manual-only, main-only and exact-repo guarded', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:\s*\n/);
  assert.match(workflow, /CONFIGURE-YEKI-HAST-DOMAINS/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /morfisam25-tech\/YEKI-HAST/);
  assert.match(workflow, /GITHUB_EVENT_NAME[^\n]*workflow_dispatch/);
  assert.match(workflow, /VERCEL_TOKEN/);
});

test('domain workflow is pinned to UNIQUE Web and exact purchased domains', () => {
  assert.match(workflow, escaped(teamId));
  assert.match(workflow, escaped(teamSlug));
  assert.match(workflow, escaped(webProjectId));
  assert.match(workflow, /PRIMARY_DOMAIN: yekihast\.app/);
  assert.match(workflow, /PRIMARY_WWW: www\.yekihast\.app/);
  assert.match(workflow, /SECONDARY_DOMAIN: yeki-hast\.com/);
  assert.match(workflow, /SECONDARY_WWW: www\.yeki-hast\.com/);
});

test('yekihast.app is canonical and every alternate hostname redirects permanently to it', () => {
  assert.match(workflow, /redirectStatusCode: 308/);
  assert.match(workflow, /\[process\.env\.PRIMARY_WWW\.trim\(\), primary\]/);
  assert.match(workflow, /\[process\.env\.SECONDARY_DOMAIN\.trim\(\), primary\]/);
  assert.match(workflow, /\[process\.env\.SECONDARY_WWW\.trim\(\), primary\]/);
  assert.match(workflow, /if \(redirect && Number\(row\.redirectStatusCode\) !== 308\)/);
});

test('workflow reports registrar DNS requirements but never mutates or purchases domains', () => {
  assert.match(workflow, /domains inspect/);
  assert.match(workflow, /GoDaddy remains the authoritative DNS provider/);
  assert.doesNotMatch(workflow, /domains buy|registrar\/domains\/.+\/buy/i);
  assert.doesNotMatch(workflow, /nameserver|nameservers/i);
  assert.doesNotMatch(workflow, /api\.godaddy\.com/i);
  assert.doesNotMatch(workflow, /billing|upgrade|purchase/i);
});

test('domain workflow cannot touch API, Admin, database or Evidence Axis targets', () => {
  assert.doesNotMatch(workflow, /prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy/);
  assert.doesNotMatch(workflow, /prj_l18v3f003ORfiN6hKxYwJbvVPzzC/);
  assert.doesNotMatch(workflow, /DATABASE_URL|PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(workflow, /evidence[-_ ]?axis/i);
});
