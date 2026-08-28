import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const marketplace = await readFile(new URL('../services/api/src/routes/marketplace.ts', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

function blockPredicate(source: string, callerParam: string): string {
  const start = source.indexOf('SELECT 1 FROM app.blocks b');
  assert.ok(start >= 0);
  const end = source.indexOf(')', source.indexOf('(b.expires_at IS NULL OR b.expires_at>now())', start));
  assert.ok(end > start);
  return source.slice(start, end + 1).replaceAll(callerParam, '$CALLER');
}

test('marketplace hides active blocks in either direction', () => {
  assert.match(marketplace, /SELECT 1 FROM app\.blocks b/);
  assert.match(marketplace, /b\.blocker_user_id=\$6 AND b\.blocked_user_id=lp\.user_id/);
  assert.match(marketplace, /b\.blocker_user_id=lp\.user_id AND b\.blocked_user_id=\$6/);
  assert.match(marketplace, /b\.expires_at IS NULL OR b\.expires_at>now\(\)/);
});

test('marketplace block semantics stay aligned with call assignment', () => {
  assert.equal(blockPredicate(marketplace, '$6'), blockPredicate(calls, '$8'));
});

test('block filtering happens before marketplace results are returned', () => {
  const block = marketplace.indexOf('SELECT 1 FROM app.blocks b');
  const response = marketplace.indexOf('sendJson(res, 200');
  assert.ok(block >= 0 && response > block);
});
