import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/call-dispatch.ts', import.meta.url), 'utf8');

test('dispatch failure releases the full reservation inside the same transaction', () => {
  assert.match(source, /withTransaction\(async \(client\) =>/);
  assert.match(source, /reserved_minor=reserved_minor-\$3::bigint/);
  assert.match(source, /RETURNING id/);
  assert.match(source, /if \(!released\.rowCount\) throw new Error\('wallet_release_conflict'\)/);
});

test('dispatch failure cannot report a terminal failure after silently missing wallet release', () => {
  const failedIndex = source.indexOf("SET status='failed'");
  const releaseGuardIndex = source.indexOf("if (!released.rowCount) throw new Error('wallet_release_conflict')");
  const eventIndex = source.indexOf("VALUES ($1,'failed','telephony'");
  assert.ok(failedIndex >= 0 && releaseGuardIndex > failedIndex && eventIndex > releaseGuardIndex);
});
