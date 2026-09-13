import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const sources = [
  ['0001_initial.sql', new URL('../packages/db/migrations/0001_initial.sql.gz.b64', import.meta.url), true],
  ['0002_email_auth.sql', new URL('../packages/db/migrations/0002_email_auth.sql', import.meta.url), false],
  ['0003_internet_voice_transport.sql', new URL('../packages/db/migrations/0003_internet_voice_transport.sql', import.meta.url), false],
  ['0004_booking.sql', new URL('../packages/db/migrations/0004_booking.sql', import.meta.url), false],
  ['0005_no_answer_hold_idempotency.sql', new URL('../packages/db/migrations/0005_no_answer_hold_idempotency.sql', import.meta.url), false],
  ['0006_internet_voice_server_sweeper.sql', new URL('../packages/db/migrations/0006_internet_voice_server_sweeper.sql', import.meta.url), false],
  ['0007_global_caller_market_feedback.sql', new URL('../packages/db/migrations/0007_global_caller_market_feedback.sql', import.meta.url), false],
  ['0008_caller_quote_bindings.sql', new URL('../packages/db/migrations/0008_caller_quote_bindings.sql', import.meta.url), false],
  ['0009_booking_reservation_sweeper.sql', new URL('../packages/db/migrations/0009_booking_reservation_sweeper.sql', import.meta.url), false],
];

export async function currentMigrationEntries() {
  const entries = [];
  for (const [filename, url, packed] of sources) {
    const raw = await readFile(url, 'utf8');
    const sql = packed
      ? gunzipSync(Buffer.from(raw.trim(), 'base64')).toString('utf8')
      : raw.replaceAll('\r\n', '\n');
    entries.push([filename, createHash('sha256').update(sql).digest('hex')]);
  }
  return entries;
}

export async function currentMigrationMap() {
  return new Map(await currentMigrationEntries());
}
