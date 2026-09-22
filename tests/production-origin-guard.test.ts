import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
// W78: 'theta' was this test's "current" origin, but it has since been
// superseded by 'unique-6ff0' -- confirmed both by tests/deployment-api-base-
// guard.test.ts (which already tracks 'theta' as staleApiOrigin and
// 'unique-6ff0' as canonicalApiOrigin) and by W66's live check
// (https://yeki-hast-theta.vercel.app returned 404). 'theta' was removed
// from services/api/src/routes/payments.ts's callback-origin fallback in the
// same change that surfaced this test was checking the wrong constant --
// that fallback was itself a bug (a silent production fallback to a stale
// origin), not a legitimate remaining use of 'theta'.
const staleOrigins = ['https://yeki-hast.vercel.app', 'https://yeki-hast-theta.vercel.app'];
const currentOrigin = 'https://yeki-hast-unique-6ff0.vercel.app';
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

  await walk(fileURLToPath(rootPath));
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
    if (staleOrigins.some((stale) => source.includes(stale))) offenders.push(file);
    if (source.includes(currentOrigin)) currentOriginSeen = true;
  }

  assert.deepEqual(offenders, [], `stale production API origin found in: ${offenders.join(', ')}`);
  assert.equal(currentOriginSeen, true, 'current production API origin should be anchored in runtime/release source');
});
