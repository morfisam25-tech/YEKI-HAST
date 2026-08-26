import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../services/api/src/routes/admin-kyc.ts', import.meta.url), 'utf8');

test('manual admin KYC review only permits reject or expire', () => {
  assert.match(source, /body\.action !== 'reject' && body\.action !== 'expire'/);
  assert.doesNotMatch(source, /body\.action === 'verify'/);
  assert.doesNotMatch(source, /nextKycStatus\s*=.*verified/);
});

test('admin KYC view never decrypts private identity fields', () => {
  assert.doesNotMatch(source, /decryptPrivateText/);
  assert.match(source, /completeness/);
});
