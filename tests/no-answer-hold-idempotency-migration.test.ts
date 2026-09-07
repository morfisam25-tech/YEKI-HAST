import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../packages/db/migrations/0005_no_answer_hold_idempotency.sql', import.meta.url), 'utf8');
const route = await readFile(new URL('../services/api/src/routes/internet-voice.ts', import.meta.url), 'utf8');
const migrate = await readFile(new URL('../packages/db/src/migrate.ts', import.meta.url), 'utf8');

test('route and no-answer ledger trigger share one release idempotency key', () => {
  const key = 'hold:release:no_answer';
  assert.match(route, new RegExp(key));
  assert.match(migration, new RegExp(key));
  assert.match(migration, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
});

test('idempotency migration is registered after booking migration', () => {
  const booking = migrate.indexOf("0004_booking.sql");
  const fix = migrate.indexOf("0005_no_answer_hold_idempotency.sql");
  assert.ok(booking >= 0 && fix > booking);
});