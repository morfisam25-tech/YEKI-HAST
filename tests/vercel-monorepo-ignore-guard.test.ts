import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const adminConfig = await readFile(new URL('../apps/admin/vercel.json', import.meta.url), 'utf8');
const webConfig = await readFile(new URL('../apps/web/vercel.json', import.meta.url), 'utf8');
const rootConfig = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');

for (const [name, config] of [['admin', adminConfig], ['web', webConfig]] as const) {
  test(`${name} Vercel project skips builds when its own root is unchanged`, () => {
    const parsed = JSON.parse(config) as { ignoreCommand?: string };
    const command = parsed.ignoreCommand ?? '';
    assert.match(command, /VERCEL_GIT_PREVIOUS_SHA/);
    assert.match(command, /VERCEL_GIT_COMMIT_SHA/);
    assert.match(command, /git diff --quiet/);
    assert.match(command, /-- \./);
    assert.match(command, /-z \"\$VERCEL_GIT_PREVIOUS_SHA\"/);
    assert.match(command, /then exit 1/);
  });
}

test('API Vercel routing remains enabled and production build never auto-migrates', () => {
  const root = JSON.parse(rootConfig) as { git?: { deploymentEnabled?: boolean }; rewrites?: Array<{ source?: string }> };
  assert.notEqual(root.git?.deploymentEnabled, false);
  assert.ok(root.rewrites?.some((entry) => entry.source === '/health'));
  assert.ok(root.rewrites?.some((entry) => entry.source === '/ready'));
  assert.ok(root.rewrites?.some((entry) => entry.source === '/v1/:path*'));

  const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> };
  const vercelBuild = pkg.scripts?.['vercel-build'] ?? '';
  assert.doesNotMatch(vercelBuild, /db:migrate/);
  assert.match(vercelBuild, /verify-production-db\.mjs/);
});
