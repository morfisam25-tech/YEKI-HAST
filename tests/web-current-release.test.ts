import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/deploy-production-web-v2.yml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');

function index(label: string) {
  const position = workflow.indexOf(label);
  assert.ok(position >= 0, `missing workflow step: ${label}`);
  return position;
}

test('current Web V2 release is manual-only and pinned to main, UNIQUE and the exact Web project', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /DEPLOY-PRODUCTION-WEB-V2/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /morfisam25-tech\/YEKI-HAST/);
  assert.match(workflow, /team_GmseY3ibD05FWemVhLElL3hI/);
  assert.match(workflow, /prj_afhSiMYpsCfIAxuOmotLAWBvTMDg/);
  assert.match(workflow, /https:\/\/web-unique-6ff0\.vercel\.app/);
  assert.match(workflow, /https:\/\/yekihast\.app/);
  assert.doesNotMatch(workflow, /evidence[-_ ]?axis/i);
});

test('current Web V2 release requires green QA and the locked release toolchain before Vercel mutation', () => {
  const qa = index('Require successful Foundation QA coverage for this source');
  const install = index('Install locked workspace and require Vercel CLI');
  const protection = index('Configure Standard protection for exact production deployment URLs');
  assert.ok(qa < install && install < protection);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /node-version: '22\.23\.1'/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(workflow, /npx --yes|vercel@latest/);
});

test('Web is built app-locally then staged with repo-level monorepo semantics without touching Admin runtime', () => {
  const build = index('Build Web production artifact');
  const switchLink = index('Switch to proven repo-level monorepo deploy link');
  const deploy = index('Deploy protected staged production without custom-domain assignment');
  assert.ok(build < switchLink && switchLink < deploy);
  assert.match(workflow, /"\$VERCEL_BIN" build --prod/);
  assert.match(workflow, /deploy --prebuilt --prod --skip-domain --yes/);
  assert.doesNotMatch(workflow, /Deploy prebuilt Admin/);
  assert.doesNotMatch(workflow, /promote "\$ADMIN/);
});

test('skip-domain behavior is verified against the real primary custom domain before exact smoke and promotion', () => {
  const capture = index('Capture current primary custom-domain deployment for restore');
  const deploy = index('Deploy protected staged production without custom-domain assignment');
  const exact = index('Require exact staged deployment READY and protected');
  const smoke = index('Authenticated smoke exact staged deployment');
  const unchanged = index('Require custom production domain stayed on prior deployment during stage');
  const promote = index('Promote verified staged deployment');
  const promotedVerify = index('Verify promoted deployment and domain policy');
  const publicVerify = index('Verify public Vercel canonical required surfaces');
  const restore = index('Restore prior verified deployment if post-promotion verification fails');
  assert.ok(capture < deploy && deploy < exact && exact < smoke && smoke < unchanged && unchanged < promote && promote < promotedVerify && promotedVerify < publicVerify && publicVerify < restore);
  assert.match(workflow, /new URL\(process\.env\.WEB_PRIMARY_DOMAIN\)\.host/);
  assert.match(workflow, /primary custom domain changed before verification despite --skip-domain/);
  assert.match(workflow, /--deployment "\$WEB_EXACT_DEPLOYMENT_URL"[\s\S]*--yes[\s\S]*--token "\$VERCEL_TOKEN"/);
  assert.match(workflow, /\/privacy 'Web و اپ موبایل'/);
  assert.match(workflow, /\/account\/delete 'حذف واقعی حساب'/);
});

test('restore is pinned to the exact deployment captured from the primary custom domain before this run', () => {
  assert.match(workflow, /PREVIOUS_DEPLOYMENT_URL: \$\{\{ steps\.previous_web\.outputs\.deployment_url \}\}/);
  assert.match(workflow, /PREVIOUS_DEPLOYMENT_ID: \$\{\{ steps\.previous_web\.outputs\.deployment_id \}\}/);
  assert.match(workflow, /failure\(\) && steps\.promote_web\.outcome == 'success'/);
  assert.match(workflow, /promote "\$PREVIOUS_DEPLOYMENT_URL" --yes/);
  assert.doesNotMatch(workflow, /\/rollback\//);
  assert.match(workflow, /previous verified Web deployment restored/);
});

test('all inline Node heredocs in the Web V2 release have valid module syntax', () => {
  const blocks = [...workflow.matchAll(/node <<'NODE'\n([\s\S]*?)\n\s+NODE/g)].map((match) => match[1]);
  assert.ok(blocks.length >= 5, 'expected multiple inline Node release guards');
  const directory = mkdtempSync(join(tmpdir(), 'yeki-web-release-v2-'));
  try {
    blocks.forEach((block, blockIndex) => {
      const lines = block.split('\n');
      const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length ?? 0);
      const indent = Math.min(...indents);
      const source = lines.map((line) => line.slice(indent)).join('\n');
      const path = join(directory, `block-${blockIndex}.mjs`);
      writeFileSync(path, source);
      const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
