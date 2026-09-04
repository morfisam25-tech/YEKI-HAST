import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dbClient = await readFile(new URL('../packages/db/src/client.ts', import.meta.url), 'utf8');
const envSync = await readFile(new URL('../scripts/sync-vercel-production-env.mjs', import.meta.url), 'utf8');
const securityVerifier = await readFile(new URL('../scripts/verify-production-security-config.mjs', import.meta.url), 'utf8');
const emailProvider = await readFile(new URL('../services/api/src/providers/email.ts', import.meta.url), 'utf8');
const paymentProvider = await readFile(new URL('../services/api/src/providers/payment.ts', import.meta.url), 'utf8');
const callRoute = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');
const listenerCard = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');
const scaleDoc = await readFile(new URL('../docs/SCALE_READINESS.md', import.meta.url), 'utf8');

test('serverless runtime keeps a bounded per-instance database pool', () => {
  assert.match(dbClient, /process\.env\.NODE_ENV === 'production' \? 2 : 10/);
  assert.match(dbClient, /value < 1 \|\| value > 10/);
  assert.match(dbClient, /max: poolMax\(\)/);
  assert.match(dbClient, /connectionTimeoutMillis: 10_000/);
});

test('controlled production runtime derives a Neon PgBouncer hostname without changing the approved source credential', () => {
  assert.match(envSync, /const databaseUrl = required\('PRODUCTION_DATABASE_URL'\)/);
  assert.match(envSync, /const runtimeDatabaseUrl = pooledRuntimeDatabaseUrl\(databaseUrl\)/);
  assert.match(envSync, /labels\[0\]\.endsWith\('-pooler'\)/);
  assert.match(envSync, /setSensitive\('DATABASE_URL', runtimeDatabaseUrl\)/);
  assert.match(envSync, /setPlain\('DB_POOL_MAX', '2'\)/);
});

test('Caller cannot be opened on a direct Neon connection or oversized local pool', () => {
  assert.match(securityVerifier, /requirePooledProductionDatabase\('DATABASE_URL'\)/);
  assert.match(securityVerifier, /endsWith\('-pooler'\)/);
  assert.match(securityVerifier, /integer\('DB_POOL_MAX', 2, 1, 2\)/);
});

test('slow external providers stay time bounded rather than pinning runtime capacity indefinitely', () => {
  assert.ok((emailProvider.match(/AbortSignal\.timeout\(10_000\)/g) ?? []).length >= 2);
  assert.match(paymentProvider, /AbortSignal\.timeout\(10_000\)/);
});

test('call creation retains client-request idempotency at the API boundary', () => {
  assert.match(callRoute, /clientRequestId/);
  assert.match(callRoute, /client_request_id/);
});

test('scale documentation does not falsely claim an executed load benchmark', () => {
  assert.match(scaleDoc, /real voice capacity not yet certified/);
  assert.match(scaleDoc, /1,000 call attempts\/completions per day/);
  assert.match(scaleDoc, /100 simultaneously active calls/);
  assert.match(scaleDoc, /adaptive\/jittered schedule/);
  assert.match(scaleDoc, /no enabled production telephony adapter/);
  assert.match(listenerCard, /setInterval/);
  assert.match(listenerCard, /5_000/);
});
