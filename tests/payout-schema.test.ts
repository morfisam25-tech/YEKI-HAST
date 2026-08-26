import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../packages/db/migrations/0001_initial.sql', import.meta.url), 'utf8');

test('payout status cannot revert to created and terminal states stay terminal', () => {
  assert.match(sql, /CREATE TRIGGER payouts_guard_status_transition/);
  assert.match(sql, /OLD\.status <> 'created' AND NEW\.status = 'created'/);
  assert.match(sql, /payout_status_cannot_revert_to_created/);
  assert.match(sql, /OLD\.status IN \('paid', 'cancelled'\) AND NEW\.status <> OLD\.status/);
  assert.match(sql, /payout_status_terminal/);
});

test('payout item delete allows parent ON DELETE CASCADE path', () => {
  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION app.guard_payout_item_mutation()');
  const fnEnd = sql.indexOf('CREATE TRIGGER payout_items_guard_mutation', fnStart);
  const fn = sql.slice(fnStart, fnEnd);
  assert.match(fn, /IF target_status IS NULL THEN[\s\S]*IF TG_OP = 'DELETE' THEN[\s\S]*RETURN OLD;/);
  assert.match(fn, /RAISE EXCEPTION 'payout_not_found'/);
});
