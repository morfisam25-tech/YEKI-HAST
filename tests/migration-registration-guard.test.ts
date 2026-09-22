import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir } from 'node:fs/promises';
import { currentMigrationEntries } from '../scripts/current-migration-manifest.mjs';

// W63: regression protection for the exact class of gap W60's own report
// documented finding by hand (0010_recording_core_foundation.sql existed on
// disk but was never registered in packages/db/src/migrate.ts's
// migrationSources or scripts/current-migration-manifest.mjs's sources --
// `npm run db:migrate` would silently never have applied it). This test does
// not rely on a maintained expected-count constant that could itself drift;
// it reads the actual migrations directory on disk and cross-checks it
// against the canonical manifest (which migrate.ts's own migrationSources
// list is verified elsewhere -- tests/call-media-provider.test.ts and
// tests/production-db-preflight-guard.test.ts -- to stay byte-identical to).

const migrationsDir = new URL('../packages/db/migrations/', import.meta.url);

test('every .sql migration file on disk is registered in the canonical manifest, and vice versa', async () => {
  const entries = await readdir(migrationsDir);
  const onDisk = new Set(
    entries
      .filter((name) => name.endsWith('.sql') && !name.endsWith('.sql.gz.b64'))
      .filter((name) => /^\d{4}_/.test(name)),
  );

  const manifestEntries = await currentMigrationEntries();
  const inManifest = new Set(manifestEntries.map(([filename]) => filename));

  for (const filename of onDisk) {
    assert.ok(inManifest.has(filename), `${filename} exists on disk but is not registered in scripts/current-migration-manifest.mjs`);
  }
  for (const filename of inManifest) {
    assert.ok(onDisk.has(filename), `${filename} is registered in the manifest but does not exist on disk`);
  }
  assert.equal(onDisk.size, inManifest.size);
});

test('the manifest is numbered contiguously from 0001 with no gaps or duplicates', async () => {
  const manifestEntries = await currentMigrationEntries();
  const numbers = manifestEntries.map(([filename]) => Number(filename.slice(0, 4)));
  for (let index = 0; index < numbers.length; index += 1) {
    assert.equal(numbers[index], index + 1, `migration manifest is not contiguous at position ${index}: ${manifestEntries[index][0]}`);
  }
});

test('migrate.ts registers every manifest filename (read as text: importing migrate.ts would attempt a real DB connection)', async () => {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(new URL('../packages/db/src/migrate.ts', import.meta.url), 'utf8');
  const manifestEntries = await currentMigrationEntries();
  for (const [filename] of manifestEntries) {
    assert.match(raw, new RegExp(`filename: '${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), `migrate.ts is missing migrationSources entry for ${filename}`);
  }
});
