import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizedDatabaseUrl } from '../api/index.ts';

test('Vercel database preflight forces verified TLS for remote PostgreSQL URLs', () => {
  const normalized = new URL(normalizedDatabaseUrl('postgresql://user:pass@example.neon.tech/neondb?sslmode=require'));
  assert.equal(normalized.searchParams.get('sslmode'), 'verify-full');
});

test('Vercel database preflight never preserves a remote TLS downgrade', () => {
  const normalized = new URL(normalizedDatabaseUrl('postgresql://user:pass@example.neon.tech/neondb?sslmode=disable'));
  assert.equal(normalized.searchParams.get('sslmode'), 'verify-full');
});

test('local PostgreSQL URLs are not forced through remote certificate verification', () => {
  const ipv4 = new URL(normalizedDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/neondb?sslmode=disable'));
  const ipv6 = new URL(normalizedDatabaseUrl('postgresql://user:pass@[::1]:5432/neondb?sslmode=disable'));
  assert.equal(ipv4.searchParams.get('sslmode'), 'disable');
  assert.equal(ipv6.searchParams.get('sslmode'), 'disable');
});

test('shared DB client keeps the same verified-TLS and IPv6-loopback guards', () => {
  const source = readFileSync(new URL('../packages/db/src/client.ts', import.meta.url), 'utf8');
  assert.match(source, /sslmode', 'verify-full'/);
  assert.match(source, /'\[::1\]'/);
});

test('production DB verifier also forces verified TLS for remote URLs', () => {
  const source = readFileSync(new URL('../scripts/verify-production-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /sslmode', 'verify-full'/);
  assert.match(source, /'\[::1\]'/);
  assert.match(source, /normalizedDatabaseUrl\(rawConnectionString\)/);
});
