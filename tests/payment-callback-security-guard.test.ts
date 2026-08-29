import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../services/api/src/lib/payment-callback-page.ts', import.meta.url), 'utf8');

test('payment callback HTML is non-cacheable and locked against embedding, referrer leakage and active content', () => {
  assert.match(source, /cache-control'\s*,\s*'no-store'/);
  assert.match(source, /x-content-type-options'\s*,\s*'nosniff'/);
  assert.match(source, /referrer-policy'\s*,\s*'no-referrer'/);
  assert.match(source, /x-frame-options'\s*,\s*'DENY'/);
  assert.match(source, /default-src 'none'/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /form-action 'none'/);
  assert.doesNotMatch(source, /<script/i);
});

test('payment callback copy does not interpolate provider or internal payment identifiers', () => {
  const htmlSection = source.slice(source.indexOf('const html ='));
  assert.doesNotMatch(htmlSection, /providerPaymentId|providerReference|trans_id|order_id/);
});
