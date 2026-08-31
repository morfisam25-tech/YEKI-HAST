import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');

test('Vercel and production build artifacts cannot be committed accidentally', () => {
  const lines = new Set(gitignore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  assert.ok(lines.has('.vercel'), '.vercel must be ignored');
  assert.ok(lines.has('dist-api'), 'dist-api must be ignored');
  assert.ok(lines.has('.env'), '.env must be ignored');
  assert.ok(lines.has('.env.*'), 'environment variants must be ignored');
  assert.ok(lines.has('!.env.example'), 'the non-secret env contract must stay committable');
});
