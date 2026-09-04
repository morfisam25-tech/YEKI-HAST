import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/deploy-production-web-current.yml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');

function index(label: string) {
  const position = workflow.indexOf(label);
  assert.ok(position >= 0, `missing workflow step: ${label}`);
  return position;
}

test('current Web release is manual-only and pinned to main, UNIQUE and the exact Web project', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /DEPLOY-PRODUCTION-WEB/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /morfisam25-tech\/YEKI-HAST/);
  assert.match(workflow, /team_GmseY3ibD05FWemVhLElL3hI/);
  assert.match(workflow, /prj_afhSiMYpsCfIAxuOmotLAWBvTMDg/);
  assert.match(workflow, /https:\/\/web-unique-6ff0\.vercel\.app/);
  assert.doesNotMatch(workflow, /evidence[-_ ]?axis/i);
});

test('current Web release requires green QA and the locked release toolchain before Vercel mutation', () => {
  const qa = index('Require successful Foundation QA coverage for this source');
  const install = index('Install locked workspace and require Vercel CLI');
  const protection = index('Configure Standard protection for staged Web production URLs');
  assert.ok(qa < install && install < protection);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /node-version: '22\.23\.1'/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(workflow, /npx --yes|vercel@latest/);
});

test('Web is built app-locally then staged with repo-level monorepo semantics without touching Admin runtime', () => {
  const build = index('Build Web production artifact with app-local project context');
  const switchLink = index('Switch to proven repo-level monorepo deploy link');
  const deploy = index('Deploy prebuilt Web as protected staged production');
  assert.ok(build < switchLink && switchLink < deploy);
  assert.match(workflow, /vercel" build --prod|\$VERCEL_BIN" build --prod/);
  assert.match(workflow, /deploy --prebuilt --prod --skip-domain --yes/);
  assert.doesNotMatch(workflow, /Deploy prebuilt Admin/);
  assert.doesNotMatch(workflow, /promote "\$ADMIN/);
});

test('skip-domain alias behavior is verified before exact smoke and any promotion', () => {
  const capture = index('Capture exact current Web canonical deployment for rollback');
  const deploy = index('Deploy prebuilt Web as protected staged production');
  const unchanged = index('Require skip-domain left Web canonical on previous deployment');
  const exact = index('Require exact staged Web deployment READY and protected');
  const smoke = index('Authenticated smoke exact staged Web deployment');
  const promote = index('Promote only verified Web deployment');
  const publicVerify = index('Verify public Web canonical points to promoted release and required surfaces');
  const rollback = index('Restore previous Web canonical deployment if any post-deploy verification fails');
  assert.ok(capture < deploy && deploy < unchanged && unchanged < exact && exact < smoke && smoke < promote && promote < publicVerify && publicVerify < rollback);
  assert.match(workflow, /current !== previous/);
  assert.match(workflow, /Web canonical changed before verification despite --skip-domain/);
  assert.match(workflow, /--deployment "\$WEB_EXACT_DEPLOYMENT_URL"[\s\S]*--yes[\s\S]*--token "\$VERCEL_TOKEN"/);
  assert.match(workflow, /\/privacy 'Web و اپ موبایل'/);
  assert.match(workflow, /\/account\/delete 'حذف واقعی حساب'/);
});

test('rollback is pinned to the exact canonical deployment captured before this run', () => {
  assert.match(workflow, /PREVIOUS_DEPLOYMENT_ID: \$\{\{ steps\.previous_web\.outputs\.deployment_id \}\}/);
  assert.match(workflow, /failure\(\) && steps\.deploy_web\.outcome == 'success'/);
  assert.match(workflow, /projects\/\$\{encodeURIComponent\(projectId\)\}\/rollback\/\$\{encodeURIComponent\(deploymentId\)\}/);
  assert.match(workflow, /previous verified Web canonical deployment restored/);
});

test('all inline Node heredocs in the Web release have valid module syntax', () => {
  const blocks = [...workflow.matchAll(/node <<'NODE'\n([\s\S]*?)\n\s+NODE/g)].map((match) => match[1]);
  assert.ok(blocks.length >= 5, 'expected multiple inline Node release guards');
  const directory = mkdtempSync(join(tmpdir(), 'yeki-web-release-'));
  try {
    blocks.forEach((block, index) => {
      const lines = block.split('\n');
      const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length ?? 0);
      const indent = Math.min(...indents);
      const source = lines.map((line) => line.slice(indent)).join('\n');
      const path = join(directory, `block-${index}.mjs`);
      writeFileSync(path, source);
      const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
