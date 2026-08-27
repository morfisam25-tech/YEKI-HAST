import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-waitlist.ts', import.meta.url), 'utf8');

test('caller waitlist queue requires admin authentication', () => {
  assert.match(source, /await requireAdmin\(req\)/);
});

test('caller waitlist queue is bounded and oldest first', () => {
  assert.match(source, /value > 200/);
  assert.match(source, /ORDER BY w\.created_at ASC/);
});

test('caller waitlist queue does not expose phone or raw age assertions', () => {
  assert.doesNotMatch(source, /user_contacts/);
  assert.doesNotMatch(source, /caller_age_assertions/);
  assert.match(source, /phoneNumberIncluded: false/);
  assert.match(source, /ageAssertionDetailsIncluded: false/);
});
