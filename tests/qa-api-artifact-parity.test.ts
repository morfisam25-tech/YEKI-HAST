import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qaWorkflow = await readFile(new URL('../.github/workflows/foundation-qa.yml', import.meta.url), 'utf8');
const apiWorkflow = await readFile(new URL('../.github/workflows/deploy-production-api.yml', import.meta.url), 'utf8');
const rootVercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

function requireArtifactContract(workflow: string) {
  assert.match(workflow, /"regions": \["iad1"\]/);
  assert.match(workflow, /"source": "\/health", "destination": "\/api\/index"/);
  assert.match(workflow, /"source": "\/ready", "destination": "\/api\/index"/);
  assert.match(workflow, /"source": "\/v1\/:path\*", "destination": "\/api\/index"/);
  assert.match(workflow, /"\$ESBUILD_BIN" api\/index\.ts/);
  assert.match(workflow, /--platform=node/);
  assert.match(workflow, /--target=node22/);
  assert.match(workflow, /--format=esm/);
  assert.match(workflow, /--external:pg/);
  assert.match(workflow, /--alias:@yeki-hast\/types=\.\/packages\/types\/src\/index\.ts/);
  assert.match(workflow, /node --check dist-api\/index\.mjs/);
  assert.match(workflow, /"engines": \{ "node": "22\.x" \}/);
}

test('QA bundle and production deploy build the same API runtime contract in iad1', () => {
  assert.deepEqual(rootVercel.regions, ['iad1']);
  requireArtifactContract(qaWorkflow);
  requireArtifactContract(apiWorkflow);
});

test('Foundation QA syntax-checks every release-critical DB and deployment helper added to the gate', () => {
  for (const script of [
    'preflight-production-db-migration.mjs',
    'verify-production-security-config.mjs',
    'verify-production-db.mjs',
    'sync-vercel-production-env.mjs',
    'smoke-production-email-auth.mjs',
    'require-green-foundation-qa.mjs',
  ]) {
    assert.match(qaWorkflow, new RegExp(`node --check scripts/${script.replace(/\./g, '\\.')}`));
  }
});
