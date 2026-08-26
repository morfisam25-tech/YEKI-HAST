import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gregorianIsoToJalali,
  jalaliToGregorianIso,
} from '../services/api/src/domain/persian-calendar.ts';

test('Nowruz conversions are stable and UTC-safe', () => {
  assert.equal(jalaliToGregorianIso('1403-01-01'), '2024-03-20');
  assert.deepEqual(gregorianIsoToJalali('2024-03-20'), { year: 1403, month: 1, day: 1 });
});

test('valid Jalali leap-day round trips', () => {
  const gregorian = jalaliToGregorianIso('1399-12-30');
  assert.deepEqual(gregorianIsoToJalali(gregorian), { year: 1399, month: 12, day: 30 });
});

test('invalid non-leap Esfand 30 is rejected', () => {
  assert.throws(() => jalaliToGregorianIso('1402-12-30'), /invalid_jalali_date/);
});

test('arbitrary birth date round trips without timezone drift', () => {
  const source = '1365-08-17';
  const gregorian = jalaliToGregorianIso(source);
  assert.deepEqual(gregorianIsoToJalali(gregorian), { year: 1365, month: 8, day: 17 });
});
