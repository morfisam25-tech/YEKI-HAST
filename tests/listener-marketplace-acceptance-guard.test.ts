import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const marketplace = await readFile(new URL('../services/api/src/routes/marketplace.ts', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('marketplace resolves the authenticated caller declared gender', () => {
  assert.match(marketplace, /FROM app\.caller_profiles cp[\s\S]*WHERE cp\.user_id=\$6/);
  assert.match(marketplace, /CROSS JOIN caller cp/);
});

test('marketplace hides listeners who do not accept the authenticated caller gender', () => {
  assert.match(marketplace, /cp\.declared_gender IS NULL/);
  assert.match(marketplace, /cp\.declared_gender='male' AND pres\.accepts_male=true/);
  assert.match(marketplace, /cp\.declared_gender='female' AND pres\.accepts_female=true/);
});

test('marketplace acceptance semantics stay aligned with assignment semantics', () => {
  assert.match(calls, /\$7::text IS NULL OR \(\$7='male' AND pres\.accepts_male=true\) OR \(\$7='female' AND pres\.accepts_female=true\)/);
  for (const token of ['accepts_male=true', 'accepts_female=true']) {
    assert.ok(marketplace.includes(token));
    assert.ok(calls.includes(token));
  }
});

test('caller self-exclusion remains active alongside acceptance filtering', () => {
  assert.match(marketplace, /lp\.user_id<>\$6::uuid/);
  assert.match(calls, /lp\.user_id<>\$8::uuid/);
});
