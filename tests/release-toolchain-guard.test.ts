import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const nvmrc = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim();
const npmrc = await readFile(new URL('../.npmrc', import.meta.url), 'utf8');
const lockWorkflow = await readFile(new URL('../.github/workflows/generate-dependency-lock.yml', import.meta.url), 'utf8');

const nodeVersion = '22.23.1';
const npmVersion = '10.9.8';

test('workspace release toolchain is explicit and consistent', () => {
  assert.equal(nvmrc, nodeVersion);
  assert.equal(pkg.packageManager, `npm@${npmVersion}`);
  assert.equal(pkg.engines?.node, '22.x');
  assert.equal(pkg.engines?.npm, npmVersion);
  assert.match(npmrc, /^engine-strict=true$/m);
  assert.match(npmrc, /^package-lock=true$/m);
});

test('dependency lock is generated only with the exact Node and npm toolchain', () => {
  assert.match(lockWorkflow, /node-version: '22\.23\.1'/);
  assert.ok(lockWorkflow.includes(`test "$(node --version)" = 'v${nodeVersion}'`));
  assert.ok(lockWorkflow.includes(`test "$(npm --version)" = '${npmVersion}'`));
  assert.match(lockWorkflow, /npm install --package-lock-only --ignore-scripts --no-audit --no-fund/);
  assert.match(lockWorkflow, /npm ci --ignore-scripts --no-audit --no-fund/);
});
