import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const repoRoot = new URL('../', import.meta.url);
const staleOrigin = 'https://yeki-hast.vercel.app';
const currentOrigin = 'https://yeki-hast-theta.vercel.app';
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md']);

async function collectTextFiles(relativeDir: string): Promise<string[]> {
  const rootPath = new URL(relativeDir, repoRoot);
  const results: string[] = [];

  async function walk(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
        await walk(child);
      } else if (textExtensions.has(extname(entry.name))) {
        results.push(child);
      }
    }
  }

  await walk(rootPath.pathname);
  return results;
}

test('runtime source contains no stale production API origin', async () => {
  const files = [
    ...(await collectTextFiles('api/')),
    ...(await collectTextFiles('apps/')),
    ...(await collectTextFiles('services/')),
    ...(await collectTextFiles('packages/')),
    ...(await collectTextFiles('scripts/')),
  ];

  const offenders: string[] = [];
  let currentOriginSeen = false;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (source.includes(staleOrigin)) offenders.push(file);
    if (source.includes(currentOrigin)) currentOriginSeen = true;
  }

  assert.deepEqual(offenders, [], `stale production API origin found in: ${offenders.join(', ')}`);
  assert.equal(currentOriginSeen, true, 'current production API origin should be anchored in runtime/release source');
});
