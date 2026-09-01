import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiEntry = await readFile(new URL('../api/index.ts', import.meta.url), 'utf8');

test('live /ready requires migration tracking relation and both canonical migration hashes', () => {
  assert.match(apiEntry, /public\.yeki_hast_schema_migrations/);
  assert.match(apiEntry, /0001_initial\.sql/);
  assert.match(apiEntry, /f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09/);
  assert.match(apiEntry, /0002_email_auth\.sql/);
  assert.match(apiEntry, /3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90/);
  assert.match(apiEntry, /readiness_migration_integrity_mismatch/);
  assert.match(apiEntry, /service_not_ready/);
});

test('controlled API entrypoint does not dump raw internal errors into production logs', () => {
  assert.match(apiEntry, /function logInternal\(/);
  assert.doesNotMatch(apiEntry, /console\.error\('readiness_database_query_failed', error\)/);
  assert.doesNotMatch(apiEntry, /console\.error\('bootstrap_database_query_failed', error\)/);
  assert.doesNotMatch(apiEntry, /console\.error\('backend_import_failed', error\)/);
});
