import { execFileSync } from 'node:child_process';

const repository = process.env.GITHUB_REPOSITORY?.trim();
const headSha = process.env.GITHUB_SHA?.trim();
const token = process.env.GITHUB_TOKEN?.trim();

if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('GITHUB_REPOSITORY is required');
}
if (!headSha || !/^[0-9a-f]{40}$/i.test(headSha)) {
  throw new Error('GITHUB_SHA must be a full commit SHA');
}
if (!token) {
  throw new Error('GITHUB_TOKEN is required for Foundation QA attestation');
}

const url = new URL(`https://api.github.com/repos/${repository}/actions/workflows/foundation-qa.yml/runs`);
url.searchParams.set('branch', 'main');
url.searchParams.set('status', 'success');
url.searchParams.set('per_page', '50');

const response = await fetch(url, {
  headers: {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'yeki-hast-release-gate',
    'x-github-api-version': '2022-11-28',
  },
});

if (!response.ok) {
  throw new Error(`Unable to verify Foundation QA history (GitHub HTTP ${response.status})`);
}

const payload = await response.json();
const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];

function isAncestor(candidate) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', candidate, headSha], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function changedPathsSince(candidate) {
  const output = execFileSync('git', ['diff', '--name-only', `${candidate}..${headSha}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return output.split('\n').map((value) => value.trim()).filter(Boolean);
}

function metadataOnly(path) {
  return path.startsWith('.launch/') || path.startsWith('docs/');
}

for (const run of runs) {
  const candidate = typeof run?.head_sha === 'string' ? run.head_sha : '';
  if (run?.conclusion !== 'success' || !/^[0-9a-f]{40}$/i.test(candidate)) continue;
  if (!isAncestor(candidate)) continue;

  const changed = changedPathsSince(candidate);
  if (changed.every(metadataOnly)) {
    console.log(`Foundation QA attestation PASS (${candidate.slice(0, 12)}; ${changed.length} metadata-only change(s) since green)`);
    process.exit(0);
  }
}

throw new Error('No successful Foundation QA ancestor covers the current production source. Run Foundation QA successfully on current source before deploying.');
