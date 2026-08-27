import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const wallet = await readFile(new URL('../apps/mobile/src/CallerWalletCard.tsx', import.meta.url), 'utf8');
const caller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');

test('caller wallet derives display units from bootstrap instead of hardcoded currency math', () => {
  assert.match(wallet, /getBootstrap\(\)/);
  assert.match(wallet, /bootstrap\?\.pricing\.displayDivisor/);
  assert.match(wallet, /bootstrap\?\.pricing\.displayUnit/);
  assert.match(wallet, /BigInt\(normalized\) \* BigInt\(Math\.max\(1, Math\.trunc\(divisor\)\)\)/);
});

test('caller wallet reads available and reserved funds from server wallet state', () => {
  assert.match(wallet, /getWallet\(token\)/);
  assert.match(wallet, /item\.currencyCode === 'IRR'/);
  assert.match(wallet, /wallet\?\.availableMinor/);
  assert.match(wallet, /wallet\?\.reservedMinor/);
});

test('caller topup uses backend idempotency and opens only returned payment URL', () => {
  assert.match(wallet, /createWalletTopup\(/);
  assert.match(wallet, /`mobile-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)/);
  assert.match(wallet, /if \(created\.paymentUrl\) await Linking\.openURL\(created\.paymentUrl\)/);
  assert.doesNotMatch(wallet, /nextpay\.org/);
});

test('caller can explicitly verify pending topup and refresh wallet balance', () => {
  assert.match(wallet, /verifyWalletTopup\(token, attempt\.attemptId\)/);
  assert.match(wallet, /await refreshWallet\(\)/);
  assert.match(wallet, /attempt\.status === 'pending'/);
  assert.match(wallet, /بررسی پرداخت/);
});

test('wallet card is hidden while a call is active or recovery conflict is unresolved', () => {
  assert.match(caller, /import CallerWalletCard from '\.\/CallerWalletCard'/);
  assert.match(caller, /recoveryComplete && !recoveryBlocked && stage !== 'call' && <CallerWalletCard token=\{token\} \/>/);
});

test('mobile API retains wallet and topup lifecycle functions', () => {
  assert.match(api, /export function getWallet/);
  assert.match(api, /export function createWalletTopup/);
  assert.match(api, /export function getWalletTopup/);
  assert.match(api, /export function verifyWalletTopup/);
});
