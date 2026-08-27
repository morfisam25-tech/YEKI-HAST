import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const authLib = await readFile(new URL('../services/api/src/lib/auth.ts', import.meta.url), 'utf8');
const authRoutes = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const mobileApi = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const storage = await readFile(new URL('../apps/mobile/src/session-storage.ts', import.meta.url), 'utf8');
const app = await readFile(new URL('../apps/mobile/App.tsx', import.meta.url), 'utf8');
const mobilePackage = await readFile(new URL('../apps/mobile/package.json', import.meta.url), 'utf8');
const appConfig = await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8');

test('current session validation and logout operate on bearer token hashes only', () => {
  assert.match(authLib, /function bearerToken/);
  assert.match(authLib, /tokenHash\(raw\)/);
  assert.match(authLib, /export async function revokeCurrentSession/);
  assert.match(authLib, /WHERE token_hash=\$1 AND revoked_at IS NULL/);
  assert.doesNotMatch(authLib, /RETURNING[^\n]*token_hash/);
  assert.match(authRoutes, /export async function getCurrentSession/);
  assert.match(authRoutes, /const \{ userId \} = await requireAuth\(req\)/);
  assert.match(authRoutes, /export async function logoutCurrentSession/);
  assert.match(authRoutes, /await revokeCurrentSession\(req\)/);
});

test('session endpoints are explicitly wired without requiring OTP provider readiness', () => {
  assert.match(handler, /method === 'GET' && url\.pathname === '\/v1\/auth\/session'/);
  assert.match(handler, /method === 'POST' && url\.pathname === '\/v1\/auth\/logout'/);
  assert.match(handler, /getCurrentSession/);
  assert.match(handler, /logoutCurrentSession/);
  const sessionRoute = handler.indexOf("url.pathname === '/v1/auth/session'");
  const logoutRoute = handler.indexOf("url.pathname === '/v1/auth/logout'");
  assert.ok(sessionRoute >= 0 && logoutRoute > sessionRoute);
});

test('mobile session token is stored only in SecureStore with purpose metadata', () => {
  assert.match(mobilePackage, /"expo-secure-store": "~57\.0\.2"/);
  assert.match(appConfig, /"expo-secure-store"/);
  assert.match(storage, /import \* as SecureStore from 'expo-secure-store'/);
  assert.match(storage, /SecureStore\.setItemAsync\(TOKEN_KEY, token\)/);
  assert.match(storage, /SecureStore\.getItemAsync\(TOKEN_KEY\)/);
  assert.match(storage, /SecureStore\.deleteItemAsync\(TOKEN_KEY\)/);
  assert.match(storage, /purpose !== 'listener' && purpose !== 'caller'/);
  assert.doesNotMatch(storage, /AsyncStorage|localStorage|console\.log/);
});

test('mobile validates stored tokens before restoring authenticated screens', () => {
  assert.match(mobileApi, /export function getCurrentSession/);
  assert.match(mobileApi, /export function logoutCurrentSession/);
  assert.match(app, /const stored = await loadStoredSession\(\)/);
  assert.match(app, /await getCurrentSession\(stored\.token\)/);
  assert.match(app, /setToken\(stored\.token\)/);
  assert.match(app, /setAuthPurpose\(stored\.purpose\)/);
  assert.match(app, /stored\.purpose === 'caller'/);
  assert.match(app, /await resumeListener\(stored\.token\)/);
  assert.match(app, /if \(code === 'unauthorized'\)/);
  assert.match(app, /await clearStoredSession\(\)\.catch/);
});

test('OTP login persists session and logout clears local storage even if server revoke fails', () => {
  assert.match(app, /await saveStoredSession\(session\.token, authPurpose\)\.catch/);
  assert.match(app, /if \(currentToken\) await logoutCurrentSession\(currentToken\)/);
  assert.match(app, /Local logout must still complete when the network is unavailable/);
  assert.match(app, /await clearStoredSession\(\)\.catch/);
  assert.match(app, /setToken\(''\)/);
  assert.match(app, /خروج از حساب/);
});
