import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const lightweight = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../services/api/src/routes/bootstrap.ts', import.meta.url), 'utf8');

for (const [name, source] of [['lightweight', lightweight], ['canonical', canonical]] as const) {
  test(`${name} bootstrap exposes the caller closed-beta flag`, () => {
    assert.match(source, /callerClosedBetaEnabled/);
    assert.match(source, /CALLER_CLOSED_BETA_ENABLED/);
  });

  test(`${name} bootstrap only exposes active launch catalog`, () => {
    assert.match(source, /s\.status='active'/);
    assert.match(source, /m\.is_active=true/);
    assert.match(source, /pp\.is_active=true/);
    assert.match(source, /FROM app\.languages WHERE is_active=true/);
  });

  test(`${name} bootstrap uses the same public pricing contract`, () => {
    for (const field of [
      'callerRatePerMinuteMinor',
      'listenerRatePerMinuteMinor',
      'platformGrossSpreadPerMinuteMinor',
      'billingIncrementSeconds',
      'displayUnit',
      'displayDivisor',
    ]) {
      assert.ok(source.includes(field), `${name} bootstrap is missing ${field}`);
    }
  });
}
