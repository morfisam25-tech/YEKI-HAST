import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../services/api/src/routes/listener-earnings.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const screen = await readFile(new URL('../apps/mobile/src/ListenerWorkScreen.tsx', import.meta.url), 'utf8');
const card = await readFile(new URL('../apps/mobile/src/ListenerEarningsCard.tsx', import.meta.url), 'utf8');

test('listener earnings endpoint is registered and scoped to the authenticated listener', () => {
  assert.match(handler, /method === 'GET' && url\.pathname === '\/v1\/listener\/earnings'/);
  assert.match(handler, /import\('\.\/routes\/listener-earnings\.ts'\)/);
  assert.match(route, /const \{ userId \} = await requireAuth\(req\)/);
  assert.match(route, /WHERE listener_user_id=\$1/);
});

test('listener earnings read model only surfaces pending available and paid without money mutation', () => {
  const filters = route.match(/status IN \('pending','available','paid'\)/g) ?? [];
  assert.equal(filters.length, 2);
  assert.doesNotMatch(route, /\bUPDATE\b/i);
  assert.doesNotMatch(route, /\bINSERT\b/i);
  assert.doesNotMatch(route, /\bDELETE\b/i);
  assert.doesNotMatch(route, /provider_reference|bank_iban|bank_account_holder/i);
});

test('mobile work state exposes grouped earnings and recent entries through the registered endpoint', () => {
  assert.match(api, /getListenerEarnings\(token: string\)/);
  assert.match(api, /request\('\/v1\/listener\/earnings', \{\}, token\)/);
  assert.match(screen, /ListenerEarningsCard/);
  assert.match(card, /درآمد من/);
  assert.match(card, /در انتظار/);
  assert.match(card, /آماده تسویه/);
  assert.match(card, /پرداخت‌شده/);
});
