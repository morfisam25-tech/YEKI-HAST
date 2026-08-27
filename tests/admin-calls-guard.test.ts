import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-calls.ts', import.meta.url), 'utf8');

test('admin calls require admin authentication', () => {
  assert.match(source, /await requireAdmin\(req\)/);
});

test('admin calls only accept known lifecycle statuses', () => {
  assert.match(source, /allowedStatuses/);
  assert.match(source, /invalid_status/);
  for (const status of ['routing', 'connected', 'completed', 'cancelled', 'failed', 'safety_terminated']) {
    assert.match(source, new RegExp(`'${status}'`));
  }
});

test('admin calls exclude phone numbers and provider bridge ids', () => {
  assert.doesNotMatch(source, /provider_bridge_id/);
  assert.doesNotMatch(source, /user_contacts/);
  assert.match(source, /phoneNumbersIncluded: false/);
  assert.match(source, /providerBridgeIdIncluded: false/);
});
