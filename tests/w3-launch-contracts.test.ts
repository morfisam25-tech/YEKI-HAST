import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { currentMigrationEntries } from '../scripts/current-migration-manifest.mjs';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

const [
  feedbackRoute,
  marketLib,
  marketRoute,
  quoteRoute,
  callRequest,
  bookingRoute,
  settlement,
  postCallFeedback,
  migration7,
  migration8,
  migrateRunner,
  apiIndex,
  productionVerifier,
] = await Promise.all([
  source('services/api/src/routes/caller-feedback.ts'),
  source('services/api/src/lib/caller-market.ts'),
  source('services/api/src/routes/caller-market.ts'),
  source('services/api/src/routes/caller-quote.ts'),
  source('services/api/src/routes/caller-call-request.ts'),
  source('services/api/src/routes/caller-bookings.ts'),
  source('services/api/src/services/internet-voice-lifecycle.ts'),
  source('apps/web/components/caller/PostCallFeedback.tsx'),
  source('packages/db/migrations/0007_global_caller_market_feedback.sql'),
  source('packages/db/migrations/0008_caller_quote_bindings.sql'),
  source('packages/db/src/migrate.ts'),
  source('api/index.ts'),
  source('scripts/verify-production-db.mjs'),
]);

test('rating is scoped to the authenticated Caller real terminal connected Call', () => {
  assert.match(feedbackRoute, /requireAuth\(req\)/);
  assert.match(feedbackRoute, /WHERE id=\$1 AND caller_user_id=\$2/);
  assert.match(feedbackRoute, /RATEABLE_STATUSES = new Set\(\['completed', 'safety_terminated'\]\)/);
  assert.match(feedbackRoute, /!relation\.listener_user_id \|\| !relation\.connected_at \|\| !RATEABLE_STATUSES\.has\(relation\.status\)/);
  assert.match(feedbackRoute, /call_not_rateable/);
});

test('rating and favorite cannot target an arbitrary Listener or another Caller relationship', () => {
  assert.match(feedbackRoute, /readJson<\{ rating\?: unknown; favorite\?: unknown \}>/);
  assert.doesNotMatch(feedbackRoute, /readJson<\{[^}]*listenerId/);
  assert.match(feedbackRoute, /relation\.listener_user_id/);
  assert.match(feedbackRoute, /VALUES \(\$1,\$2,\$3,\$4,\$5\)/);
  assert.match(feedbackRoute, /\[callId, userId, relation\.listener_user_id, relation\.service_id, rating\]/);
  assert.match(feedbackRoute, /WHERE caller_user_id=\$1 AND listener_user_id=\$2/);
});

test('favorite persistence is Caller to the real Listener and browser state is not the persistence layer', () => {
  assert.match(migration7, /CREATE TABLE IF NOT EXISTS app\.caller_favorite_listeners/);
  assert.match(migration7, /PRIMARY KEY \(caller_user_id, listener_user_id\)/);
  assert.match(feedbackRoute, /INSERT INTO app\.caller_favorite_listeners\(caller_user_id, listener_user_id\)/);
  assert.match(feedbackRoute, /DELETE FROM app\.caller_favorite_listeners/);
  assert.match(postCallFeedback, /\/feedback/);
  assert.doesNotMatch(postCallFeedback, /localStorage|sessionStorage|indexedDB/i);
});

test('Caller market is explicit and persisted; geo-IP is not authoritative', () => {
  assert.match(migration7, /ALTER TABLE app\.caller_profiles[\s\S]*ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES app\.markets\(id\)/);
  assert.match(marketRoute, /INSERT INTO app\.caller_profiles\(user_id, market_id\)/);
  assert.match(marketRoute, /marketCode/);
  assert.match(marketLib, /SELECT cp\.market_id::text market_id/);
  for (const src of [marketLib, marketRoute]) {
    assert.doesNotMatch(src, /cf-ipcountry|x-vercel-ip-country|x-forwarded-for|remoteAddress/i);
  }
});

test('Iran pricebook economics are an explicit fail-closed invariant', () => {
  assert.match(marketLib, /row\.caller_market_code === 'ir'/);
  assert.match(marketLib, /row\.currency_code !== 'IRR'/);
  assert.match(marketLib, /callerRate !== 40_000n/);
  assert.match(marketLib, /listenerRate !== 28_000n/);
  assert.match(marketLib, /platformSpread !== 12_000n/);
  assert.match(marketLib, /iran_pricebook_mismatch/);
});

test('missing, invalid or ambiguous active Caller pricebook fails closed', () => {
  assert.match(marketLib, /caller_market_required/);
  assert.match(marketLib, /caller_market_pricebook_unavailable/);
  assert.match(marketLib, /caller_market_pricebook_ambiguous/);
  assert.match(marketLib, /caller_market_pricebook_invalid/);
  assert.match(marketLib, /pp\.is_active=true/);
});

test('Caller market cannot change while an active Call or open Booking exists', () => {
  assert.match(marketRoute, /ACTIVE_CALL_STATUSES/);
  assert.match(marketRoute, /WHERE caller_user_id=\$1 AND status::text = ANY\(\$2::text\[\]\)/);
  assert.match(marketRoute, /WHERE caller_user_id=\$1 AND status IN \('booked','initiated'\)/);
  assert.match(marketRoute, /caller_market_change_blocked/);
});

test('short-lived quote binding is mandatory and rejects expiry or context mismatch', () => {
  assert.match(migration8, /CREATE TABLE IF NOT EXISTS app\.caller_quote_bindings/);
  assert.match(migration8, /quote_target IN \('instant','booking','booking_start'\)/);
  assert.match(migration8, /expires_at timestamptz NOT NULL/);
  assert.match(quoteRoute, /QUOTE_TTL_MINUTES = 15/);
  assert.match(quoteRoute, /INSERT INTO app\.caller_quote_bindings/);
  assert.match(callRequest, /quote_target='instant'/);
  assert.match(callRequest, /expires_at>now\(\)/);
  assert.match(callRequest, /quote_required/);
  assert.match(callRequest, /quote_stale/);
});

test('quote to instant Call HOLD binds market, pricebook, currency, cap and authorized amount', () => {
  assert.match(callRequest, /quoted\.caller_market_id !== context\.market\.id/);
  assert.match(callRequest, /quoted\.pricing_plan_id !== context\.pricing\.id/);
  assert.match(callRequest, /quoted\.currency_code !== context\.pricing\.currencyCode/);
  assert.match(callRequest, /authorization\.maxBillableSeconds !== quoted\.max_billable_seconds/);
  assert.match(callRequest, /authorization\.authorizedMinor !== BigInt\(quoted\.authorized_minor\)/);
  assert.match(callRequest, /reserved_minor=reserved_minor\+\$2::bigint/);
  assert.match(callRequest, /context\.pricing\.id/);
  assert.match(callRequest, /context\.pricing\.currencyCode/);
  assert.match(callRequest, /authorization\.authorizedMinor\.toString\(\)/);
  assert.match(callRequest, /DELETE FROM app\.caller_quote_bindings WHERE caller_user_id=\$1/);
});

test('Booking uses a booking quote and requires a fresh booking_start re-quote before HOLD', () => {
  assert.match(bookingRoute, /lockedQuoteBinding\(client, userId, 'booking', maxSeconds, null\)/);
  assert.match(bookingRoute, /'booking_start'/);
  assert.match(bookingRoute, /booking\.id/);
  assert.match(bookingRoute, /authorization\.authorizedMinor !== BigInt\(binding\.authorized_minor\)/);
  assert.match(bookingRoute, /booking\.caller_market_id !== context\.market\.id/);
  assert.match(bookingRoute, /reserved_minor=reserved_minor\+\$2::bigint/);
});

test('Caller charge currency is separate from Listener base payout currency with no invented FX contribution', () => {
  assert.match(migration7, /listener_currency_code varchar\(3\)/);
  assert.match(migration7, /platform_contribution_minor DROP NOT NULL/);
  assert.match(migration7, /FOREIGN KEY \(call_session_id, listener_user_id, currency_code\)[\s\S]*REFERENCES app\.call_sessions\(id, listener_user_id, listener_currency_code\)/);
  assert.match(settlement, /row\.currency_code === row\.listener_currency_code/);
  assert.match(settlement, /row\.listener_currency_code/);
  assert.match(settlement, /platform_contribution_minor=CASE/);
  assert.match(settlement, /WHEN currency_code=listener_currency_code/);
  assert.match(settlement, /ELSE NULL/);
  assert.match(settlement, /platformContributionPendingFx: !sameCurrency/);
});

test('Listener base payout is resolved from the shared Listener marketplace, not Caller country', () => {
  assert.match(marketLib, /listener_pp\.market_id=marketplace\.id/);
  assert.match(marketLib, /listener_pp\.listener_rate_per_minute_minor::text listener_rate/);
  assert.match(callRequest, /context\.listenerBase\.ratePerMinuteMinor/);
  assert.match(callRequest, /context\.listenerBase\.currencyCode/);
  assert.doesNotMatch(callRequest, /listener_rate_per_minute_minor[^\n]*caller_market/i);
});

test('migration runner recognizes 0007 and 0008 and remains transaction/hash idempotent', async () => {
  const entries = await currentMigrationEntries();
  assert.deepEqual(entries.map(([filename]) => filename), [
    '0001_initial.sql',
    '0002_email_auth.sql',
    '0003_internet_voice_transport.sql',
    '0004_booking.sql',
    '0005_no_answer_hold_idempotency.sql',
    '0006_internet_voice_server_sweeper.sql',
    '0007_global_caller_market_feedback.sql',
    '0008_caller_quote_bindings.sql',
  ]);
  for (const [, sha] of entries) assert.match(sha, /^[0-9a-f]{64}$/);
  assert.match(migrateRunner, /0007_global_caller_market_feedback\.sql/);
  assert.match(migrateRunner, /0008_caller_quote_bindings\.sql/);
  assert.match(migrateRunner, /Applied migration changed on disk/);
  assert.match(migrateRunner, /if \(existing\.rowCount\)/);
  assert.match(migrateRunner, /await client\.query\('BEGIN'\)/);
  assert.match(migrateRunner, /await client\.query\('ROLLBACK'\)/);
  assert.match(migrateRunner, /continue;/);
  assert.doesNotMatch(migration7, /^BEGIN;|^COMMIT;/m);
  assert.doesNotMatch(migration8, /^BEGIN;|^COMMIT;/m);
});

test('production readiness explicitly requires W3 migrations and schema', () => {
  assert.match(apiIndex, /0007_global_caller_market_feedback\.sql/);
  assert.match(apiIndex, /0008_caller_quote_bindings\.sql/);
  assert.match(apiIndex, /app\.call_ratings/);
  assert.match(apiIndex, /app\.caller_favorite_listeners/);
  assert.match(apiIndex, /app\.caller_quote_bindings/);
  assert.match(apiIndex, /platform_contribution_nullable_ready/);
  assert.match(apiIndex, /readiness_w3_migration_missing/);
  assert.match(productionVerifier, /currentMigrationEntries/);
  assert.match(productionVerifier, /Caller persisted market schema missing/);
  assert.match(productionVerifier, /Caller quote binding schema incomplete/);
});
