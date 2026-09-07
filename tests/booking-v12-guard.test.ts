import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('booking migration is additive and keeps Wave 1 duration presets locked', async () => {
  const sql = await source('packages/db/migrations/0004_booking.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.listener_availability/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.call_reservations/);
  assert.match(sql, /max_billable_seconds IN \(600,1800,3600\)/);
  assert.match(sql, /UNIQUE \(caller_user_id, client_request_id\)/);
  assert.match(sql, /expire_due_call_reservations/);
  assert.doesNotMatch(sql, /UPDATE app\.wallets/);
});

test('migration runner and production readiness both require Booking and Internet Voice schema', async () => {
  const migrate = await source('packages/db/src/migrate.ts');
  const ready = await source('api/index.ts');
  assert.match(migrate, /0003_internet_voice_transport\.sql/);
  assert.match(migrate, /0004_booking\.sql/);
  assert.match(ready, /0003_internet_voice_transport\.sql/);
  assert.match(ready, /0004_booking\.sql/);
  assert.match(ready, /app\.internet_voice_signals/);
  assert.match(ready, /app\.wallet_hold_events/);
  assert.match(ready, /app\.listener_availability/);
  assert.match(ready, /app\.call_reservations/);
});

test('booking API exposes Listener availability, Caller reservations, and due-session start', async () => {
  const handler = await source('services/api/src/handler.ts');
  const bookings = await source('services/api/src/routes/bookings.ts');
  assert.match(handler, /\/v1\/listener\/availability/);
  assert.match(handler, /\/v1\/listener\/bookings/);
  assert.match(handler, /\/v1\/bookings/);
  assert.match(handler, /bookingStartMatch/);
  assert.match(bookings, /availability_not_bookable/);
  assert.match(bookings, /booking_time_conflict/);
  assert.match(bookings, /booking_not_due/);
  assert.match(bookings, /computeCallAuthorization/);
  assert.match(bookings, /reserved_minor=reserved_minor\+\$2::bigint/);
  assert.match(bookings, /jsonb_build_object\('bookingId',\$2\)/);
  assert.doesNotMatch(bookings, /JOIN app\.listener_presence/);
});

test('expired booking commits missed status before the API returns booking_missed', async () => {
  const bookings = await source('services/api/src/routes/bookings.ts');
  const expiredBranch = bookings.match(/if \(now >= scheduledAt \+ booking\.max_billable_seconds \* 1000\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
  assert.match(expiredBranch, /UPDATE app\.call_reservations SET status='missed'/);
  assert.match(expiredBranch, /return \{ kind: 'missed' as const \}/);
  assert.doesNotMatch(expiredBranch, /throw new HttpError/);
  assert.match(bookings, /if \(call\.kind === 'missed'\) throw new HttpError\(409, 'booking_missed'\)/);
});

test('Internet Voice is primary and PSTN fallback stays opt-in', async () => {
  const transport = await source('services/api/src/providers/call-transport.ts');
  const workMode = await source('apps/mobile/src/ListenerWorkScreen.tsx');
  assert.match(transport, /readTransport\(process\.env\.CALL_PRIMARY_TRANSPORT, 'internet_voice'\)/);
  assert.match(transport, /CALL_FALLBACK_TRANSPORT \?\? 'none'/);
  assert.doesNotMatch(workMode, /verified_phone_required/);
  assert.doesNotMatch(workMode, /callPhoneVerified/);
  assert.doesNotMatch(workMode, /CallPhoneSetupCard/);
  assert.match(workMode, /آماده دریافت تماس اینترنتی/);
});

test('Listener active call payload exposes transport without provider bridge secrets', async () => {
  const listenerCalls = await source('services/api/src/routes/listener-calls.ts');
  assert.match(listenerCalls, /cs\.transport::text/);
  assert.match(listenerCalls, /transport: row\.transport/);
  assert.match(listenerCalls, /internetVoiceReady: row\.transport === 'internet_voice'/);
  assert.match(listenerCalls, /providerBridgeIncluded: false/);
  assert.match(listenerCalls, /callerIdentityIncluded: false/);
});

test('browser caller proxy permits booking reads and mutations without broadening arbitrary backend access', async () => {
  const proxy = await source('apps/web/app/api/caller/[...path]/route.ts');
  assert.match(proxy, /\^bookings\$\/|\^bookings\$|bookings/);
  assert.match(proxy, /availability/);
  assert.match(proxy, /MAX_PROXY_BODY_BYTES = 64 \* 1024/);
  assert.match(proxy, /browserMutationAllowed/);
  assert.match(proxy, /authentication_required/);
});
