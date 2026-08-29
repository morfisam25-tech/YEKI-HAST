import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiEntry = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');

test('API health exposes only a validated full release SHA', () => {
  assert.match(apiEntry, /process\.env\.YEKI_HAST_RELEASE_SHA/);
  assert.match(apiEntry, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(apiEntry, /releaseSha: sha/);
  assert.doesNotMatch(apiEntry, /releaseSha:\s*process\.env\.YEKI_HAST_RELEASE_SHA/);
});

test('production env sync stamps the exact GitHub workflow SHA into Vercel', () => {
  assert.match(envSync, /const releaseSha = required\('GITHUB_SHA'\)\.toLowerCase\(\)/);
  assert.match(envSync, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(envSync, /setPlain\('YEKI_HAST_RELEASE_SHA', releaseSha\)/);
});

test('production smoke refuses a canonical API alias serving any other release', () => {
  assert.match(workflow, /const expectedSha = process\.env\.GITHUB_SHA\?\.toLowerCase\(\)/);
  assert.match(workflow, /body\?\.releaseSha === expectedSha/);
  assert.match(workflow, /production API smoke PASS/);
});
