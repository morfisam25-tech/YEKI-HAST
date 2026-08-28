import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const context = await readFile(new URL('../services/api/src/lib/operating-context.ts', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../services/api/src/routes/bootstrap.ts', import.meta.url), 'utf8');
const marketplace = await readFile(new URL('../services/api/src/routes/marketplace.ts', import.meta.url), 'utf8');
const calls = await readFile(new URL('../services/api/src/routes/calls.ts', import.meta.url), 'utf8');

test('default operating context has one bounded source of environment-backed defaults', () => {
  assert.match(context, /DEFAULT_PRODUCT_CODE/);
  assert.match(context, /DEFAULT_SERVICE_CODE/);
  assert.match(context, /DEFAULT_MARKET_CODE/);
  assert.match(context, /'yeki_hast'/);
  assert.match(context, /'human_listening'/);
  assert.match(context, /'ir'/);
});

test('bootstrap, marketplace presence and call assignment all use the shared operating context', () => {
  for (const source of [bootstrap, marketplace, calls]) {
    assert.match(source, /getDefaultOperatingContextCodes/);
    assert.match(source, /productCode/);
    assert.match(source, /serviceCode/);
    assert.match(source, /marketCode/);
  }
});

test('operational SQL no longer pins a conflicting literal product/service/market context', () => {
  for (const source of [bootstrap, marketplace, calls]) {
    assert.doesNotMatch(source, /p\.code='yeki_hast'/);
    assert.doesNotMatch(source, /s\.code='human_listening'/);
    assert.doesNotMatch(source, /m\.code='ir'/);
  }
});
