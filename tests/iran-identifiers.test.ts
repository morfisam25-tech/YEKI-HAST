import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidIranIban,
  isValidIranNationalId,
  normalizeDecimalDigits,
  normalizeIranIban,
  normalizeIranNationalId,
  normalizeIsoDate,
} from '../services/api/src/domain/iran-identifiers.ts';

test('normalizes Persian and Arabic decimal digits', () => {
  assert.equal(normalizeDecimalDigits('۱۲۳٤٥٦'), '123456');
});

test('validates Iranian national ID checksum', () => {
  assert.equal(isValidIranNationalId('0013546759'), true);
  assert.equal(isValidIranNationalId('0013546758'), false);
  assert.equal(isValidIranNationalId('1111111111'), false);
  assert.equal(normalizeIranNationalId('۰۰۱-۳۵۴-۶۷۵۹'), '0013546759');
});

test('validates Iranian IBAN using mod-97', () => {
  assert.equal(isValidIranIban('IR850123456789012345678901'), true);
  assert.equal(isValidIranIban('IR840123456789012345678901'), false);
  assert.equal(normalizeIranIban('ir85 0123-4567 8901 2345 6789 01'), 'IR850123456789012345678901');
});

test('accepts only real ISO Gregorian dates', () => {
  assert.equal(normalizeIsoDate('1988-02-29'), '1988-02-29');
  assert.equal(normalizeIsoDate('1989-02-29'), null);
  assert.equal(normalizeIsoDate('۲۰۰۰-۰۱-۰۲'), '2000-01-02');
});
