import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const packedUrl = new URL('../packages/db/migrations/0001_initial.sql.gz.b64', import.meta.url);
const plainUrl = new URL('../packages/db/migrations/0001_initial.sql', import.meta.url);
const expectedSha256 = 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09';

const encoded = (await readFile(packedUrl, 'utf8')).trim();
const sql = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
const actualSha256 = createHash('sha256').update(sql).digest('hex');

if (actualSha256 !== expectedSha256) {
  throw new Error(`Canonical migration hash mismatch: ${actualSha256}`);
}

await writeFile(plainUrl, sql, 'utf8');
console.log(`materialized 0001_initial.sql ${actualSha256}`);
