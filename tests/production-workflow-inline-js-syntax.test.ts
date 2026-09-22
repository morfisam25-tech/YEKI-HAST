import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflows = [
  '.github/workflows/deploy-production-api.yml',
  '.github/workflows/deploy-production-frontends.yml',
  '.github/workflows/migrate-production-db.yml',
];

function extractNodeHeredocs(source: string): string[] {
  const scripts: string[] = [];
  const pattern = /node <<'NODE'\n([\s\S]*?)\n\s*NODE/g;
  for (const match of source.matchAll(pattern)) scripts.push(match[1]);
  return scripts;
}

for (const workflowPath of workflows) {
  test(`${workflowPath} inline Node heredocs have valid JavaScript syntax`, () => {
    const source = readFileSync(new URL(`../${workflowPath}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const scripts = extractNodeHeredocs(source);
    assert.ok(scripts.length > 0, `expected at least one Node heredoc in ${workflowPath}`);

    const dir = mkdtempSync(join(tmpdir(), 'yeki-hast-workflow-js-'));
    try {
      scripts.forEach((script, index) => {
        const file = join(dir, `inline-${index}.mjs`);
        writeFileSync(file, `${script}\n`, 'utf8');
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
