import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../packages/db/migrations/0001_initial.sql', import.meta.url), 'utf8');

function tableDefinition(name: string): string {
  const start = sql.indexOf(`CREATE TABLE ${name}`);
  assert.ok(start >= 0, `${name} missing`);
  const end = sql.indexOf(');', start);
  assert.ok(end > start, `${name} definition incomplete`);
  return sql.slice(start, end + 2);
}

test('payout prepare can bind a listener market currency tuple without schema changes', () => {
  const payouts = tableDefinition('app.payouts');
  assert.match(payouts, /listener_user_id uuid NOT NULL/);
  assert.match(payouts, /market_id uuid NOT NULL/);
  assert.match(payouts, /currency_code char\(3\) NOT NULL/);
  assert.match(payouts, /amount_minor bigint NOT NULL/);
  assert.match(payouts, /status app\.payout_status NOT NULL/);
});

test('payout items can atomically attach available earnings and prevent double attachment', () => {
  const items = tableDefinition('app.payout_items');
  assert.match(items, /payout_id uuid NOT NULL/);
  assert.match(items, /listener_user_id uuid NOT NULL/);
  assert.match(items, /currency_code char\(3\) NOT NULL/);
  assert.match(items, /earning_id uuid UNIQUE/);
  assert.match(items, /amount_minor bigint NOT NULL/);
  assert.match(items, /CHECK \(\(earning_id IS NULL\) <> \(guarantee_assignment_id IS NULL\)\)/);
});

test('payout item foreign keys bind payout and earning ownership and currency', () => {
  assert.match(sql, /FOREIGN KEY \(payout_id, listener_user_id, currency_code\)[\s\S]*?REFERENCES app\.payouts\(id, listener_user_id, currency_code\)/);
  assert.match(sql, /FOREIGN KEY \(earning_id, listener_user_id, currency_code\)[\s\S]*?REFERENCES app\.listener_earnings\(id, listener_user_id, currency_code\)/);
});

test('prepared payout sources remain mutable only while payout is created', () => {
  assert.match(sql, /CREATE TRIGGER payout_items_guard_mutation/);
  assert.match(sql, /target_status <> 'created'/);
  assert.match(sql, /CREATE TRIGGER payouts_validate_total_before_processing/);
  assert.match(sql, /payout_amount_mismatch/);
});
