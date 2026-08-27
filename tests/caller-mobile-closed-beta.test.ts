import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const caller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../apps/mobile/App.tsx', import.meta.url), 'utf8');

test('caller API contract matches listener browse response ids', () => {
  assert.match(api, /export type BrowseListener = \{\s*id: string;/);
  assert.doesNotMatch(api, /export type BrowseListener = \{\s*userId: string;/);
});

test('closed-beta caller shell requires server age confirmation before browse flow', () => {
  const age = caller.indexOf('await confirmCallerAge(token)');
  const browse = caller.indexOf('await browseListeners(token');
  assert.ok(age >= 0 && browse > age);
  assert.match(caller, /stage === 'age-gate'/);
});

test('closed-beta caller shell exposes real request, dispatch, cancel and safety exit clients', () => {
  assert.match(caller, /await requestCall\(token/);
  assert.match(caller, /await dispatchCall\(token, requested\.callId\)/);
  assert.match(caller, /await cancelCall\(token, call\.callId\)/);
  assert.match(caller, /await safetyExitCall\(token, call\.callId\)/);
});

test('caller beta shell remains disconnected from public app navigation', () => {
  assert.doesNotMatch(app, /CallerClosedBetaScreen/);
  assert.match(app, /Caller هنوز در بتای بسته است/);
});
