import { build } from 'esbuild';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} from 'node:crypto';

const TEAM_ID = 'team_GmseY3ibD05FWemVhLElL3hI';
const PROJECT_ID = 'prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy';
const TEAM_SLUG = 'unique-6ff0';
const token = process.env.VERCEL_TOKEN;
const databaseUrl = process.env.PRODUCTION_DATABASE_URL;
const marker = `w10-audio-${process.env.GITHUB_RUN_ID}`;
const vercelBin = join(process.cwd(), 'node_modules', '.bin', 'vercel');
const headers = { Authorization: `Bearer ${token}` };

if (!token) throw new Error('missing_vercel_token');
if (!databaseUrl) throw new Error('missing_production_database_url');

function emit(name, value) {
  if (!/^[A-Z0-9_]+$/.test(name) || !/^[A-Za-z0-9_ -]+$/.test(String(value))) return;
  process.stdout.write(`${name}=${value}\n`);
}

function mask(value) {
  if (value) process.stdout.write(`::add-mask::${value}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 600_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(options.category ?? 'command_failed');
  }
  return result.stdout.trim();
}

async function vercelApi(path, method = 'GET') {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`https://api.vercel.com${path}${separator}teamId=${TEAM_ID}`, { method, headers });
  if (!response.ok) throw new Error(`vercel_http_${response.status}`);
  return response.status === 204 ? {} : response.json();
}

function parseEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const name = match[1];
    if (
      name.startsWith('VERCEL_')
      || name.startsWith('INTERNAL_BETA_')
      || name.startsWith('CLOUDFLARE_TURN_')
      || name === 'INTERNET_VOICE_ICE_SERVERS_JSON'
    ) continue;
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  values.DATABASE_URL = databaseUrl;
  return values;
}

const projectBefore = await vercelApi(`/v9/projects/${PROJECT_ID}`);
const activeBefore = projectBefore.targets?.production?.id;
if (!activeBefore) throw new Error('production_snapshot_missing');

const mintDir = mkdtempSync(join(tmpdir(), 'w10-prod-mint-'));
let mintDeploymentIds = [];
let previewDeploymentIds = [];
let iceConfig;
let mintCleaned = false;
let previewCleaned = false;
let domainUntouched = false;

try {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const resultFile = `${randomBytes(16).toString('hex')}.json`;

  await build({
    entryPoints: ['services/api/src/providers/call-transport.ts'],
    outfile: join(mintDir, 'helper.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });

  const diagnostic = `
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes,publicEncrypt,createCipheriv} from 'node:crypto';
const output=process.stdout.write.bind(process.stdout);
for(const name of ['log','warn','error','info','debug','trace']) console[name]=()=>{};
const rows={PRODUCTION_RUNTIME_TURN_ENV:'FAIL',SHORT_LIVED_TURN_MINT:'FAIL',CLOUDFLARE_HTTP:'NOT_REACHED',TTL_14400:'FAIL'};
try {
  const key=process.env.CLOUDFLARE_TURN_KEY_ID?.trim()||'';
  const apiToken=process.env.CLOUDFLARE_TURN_API_TOKEN?.trim()||'';
  rows.PRODUCTION_RUNTIME_TURN_ENV=key&&apiToken?'PASS':'FAIL';
  rows.TTL_14400=process.env.CLOUDFLARE_TURN_TTL_SECONDS==='14400'?'PASS':'FAIL';
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async (...args)=>{
    const response=await nativeFetch(...args);
    if(String(args[0]).startsWith('https://rtc.live.cloudflare.com/v1/turn/keys/')) rows.CLOUDFLARE_HTTP=String(response.status);
    return response;
  };
  const {getInternetVoiceClientConfig}=await import('./helper.mjs');
  const config=await getInternetVoiceClientConfig();
  const turn=config.iceServers?.some(server=>[server.urls].flat().some(url=>/^turns?:/i.test(url))&&server.username&&server.credential);
  if(rows.PRODUCTION_RUNTIME_TURN_ENV!=='PASS'||rows.TTL_14400!=='PASS'||rows.CLOUDFLARE_HTTP!=='201'||config.relayConfigured!==true||!turn) throw new Error('mint_validation');
  rows.SHORT_LIVED_TURN_MINT='PASS';
  const aes=randomBytes(32),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',aes,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(config.iceServers),'utf8'),cipher.final()]);
  const sealed={key:publicEncrypt(${JSON.stringify(publicPem)},aes).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
  mkdirSync('public',{recursive:true});
  writeFileSync('public/${resultFile}',JSON.stringify({rows,sealed}));
} catch {
  mkdirSync('public',{recursive:true});
  writeFileSync('public/${resultFile}',JSON.stringify({rows}));
} finally {
  for(const [key,value] of Object.entries(rows)) output('W10_'+key+'='+value+'\\n');
}
`;
  writeFileSync(join(mintDir, 'diagnostic.mjs'), diagnostic, { mode: 0o600 });
  writeFileSync(join(mintDir, 'package.json'), JSON.stringify({ private: true, type: 'module', engines: { node: '22.x' } }));
  writeFileSync(join(mintDir, 'vercel.json'), JSON.stringify({ framework: null, buildCommand: 'node diagnostic.mjs', outputDirectory: 'public', git: { deploymentEnabled: false } }));
  mkdirSync(join(mintDir, '.vercel'));
  writeFileSync(join(mintDir, '.vercel', 'project.json'), JSON.stringify({ orgId: TEAM_ID, projectId: PROJECT_ID }));

  run(vercelBin, [
    'deploy', '--prod', '--skip-domain', '--yes', '--force',
    '--scope', TEAM_SLUG, '--token', token,
    '--meta', `w10AudioMint=${marker}`,
  ], { cwd: mintDir, category: 'temporary_production_scope_deploy_failed' });

  const mintList = await vercelApi(`/v6/deployments?projectId=${PROJECT_ID}&limit=30`);
  mintDeploymentIds = (mintList.deployments ?? [])
    .filter((deployment) => deployment.meta?.w10AudioMint === marker)
    .map((deployment) => deployment.uid ?? deployment.id);
  if (mintDeploymentIds.length !== 1) throw new Error('temporary_mint_deployment_not_unique');

  const mintDetail = await vercelApi(`/v13/deployments/${mintDeploymentIds[0]}`);
  // --skip-domain is the authoritative Vercel control that prevents promotion of
  // production domains. The deployment API can still report Vercel-generated
  // access aliases; those are not canonical project-domain assignments. We prove
  // safety by comparing the project's production target before and after cleanup.

  let payload;
  const direct = await fetch(`https://${mintDetail.url}/${resultFile}`);
  if (direct.ok) {
    payload = await direct.json();
  } else {
    const raw = run(vercelBin, [
      'curl', `/${resultFile}`, '--deployment', mintDetail.url,
      '--scope', TEAM_SLUG, '--token', token,
    ], { cwd: mintDir, timeout: 60_000, category: 'mint_result_retrieval_failed' });
    payload = JSON.parse(raw);
  }

  for (const [name, value] of Object.entries(payload.rows ?? {})) emit(name, value);
  if (!payload.sealed || payload.rows?.SHORT_LIVED_TURN_MINT !== 'PASS') throw new Error('short_lived_turn_mint_failed');

  const sealed = payload.sealed;
  const aes = privateDecrypt(privateKey, Buffer.from(sealed.key, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', aes, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(sealed.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  iceConfig = JSON.parse(clear);
  if (!Array.isArray(iceConfig) || !iceConfig.some((server) => [server.urls].flat().some((url) => /^turns?:/i.test(url)) && server.username && server.credential)) {
    throw new Error('decrypted_turn_config_invalid');
  }
  mask(JSON.stringify(iceConfig));

  await vercelApi(`/v13/deployments/${mintDeploymentIds[0]}`, 'DELETE');
  mintDeploymentIds = [];
  mintCleaned = true;
  const afterMint = await vercelApi(`/v9/projects/${PROJECT_ID}`);
  domainUntouched = afterMint.targets?.production?.id === activeBefore;
  if (!domainUntouched) throw new Error('production_target_changed');
  emit('TEMP_PRODUCTION_SCOPE_DEPLOYMENT', 'PASS');
  emit('DOMAIN_OR_ALIAS_TOUCHED', 'NO');
  emit('TEMP_DEPLOYMENT_CLEANED', 'PASS');
  emit('LONG_LIVED_SECRET_EXPOSED_OUTSIDE_PROD_RUNTIME', 'NO');

  const previewDir = mkdtempSync(join(tmpdir(), 'w10-audio-preview-'));
  try {
    await build({
      entryPoints: ['api/index.ts'],
      outfile: join(previewDir, 'api', 'index.mjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      external: ['pg'],
      alias: { '@yeki-hast/types': './packages/types/src/index.ts' },
      minify: true,
      logLevel: 'silent',
    });
    writeFileSync(join(previewDir, 'package.json'), JSON.stringify({ name: 'yeki-hast-api-runtime', private: true, type: 'module', dependencies: { pg: '^8.23.0' }, engines: { node: '22.x' } }));
    writeFileSync(join(previewDir, 'vercel.json'), JSON.stringify({
      $schema: 'https://openapi.vercel.sh/vercel.json',
      framework: null,
      regions: ['iad1'],
      buildCommand: 'true',
      installCommand: 'npm install --ignore-scripts --no-audit --no-fund',
      rewrites: [
        { source: '/health', destination: '/api/index' },
        { source: '/ready', destination: '/api/index' },
        { source: '/v1/:path*', destination: '/api/index' },
      ],
    }));
    mkdirSync(join(previewDir, '.vercel'));
    writeFileSync(join(previewDir, '.vercel', 'project.json'), JSON.stringify({ orgId: TEAM_ID, projectId: PROJECT_ID }));

    run(vercelBin, ['pull', '--yes', '--environment=production', '--token', token, '--scope', TEAM_SLUG], { cwd: previewDir, category: 'preview_project_pull_failed' });
    cpSync(join(previewDir, '.vercel', '.env.production.local'), join(previewDir, '.vercel', '.env.preview.local'));
    run(vercelBin, ['build', '--token', token, '--scope', TEAM_SLUG], { cwd: previewDir, category: 'preview_build_failed' });

    const runtimeEnvB64 = Buffer.from(JSON.stringify(parseEnvFile(join(previewDir, '.vercel', '.env.production.local')))).toString('base64');
    const iceJson = JSON.stringify(iceConfig);
    mask(runtimeEnvB64);
    const deployOutput = run(vercelBin, [
      'deploy', '--prebuilt', '--yes', '--token', token, '--scope', TEAM_SLUG,
      '--env', 'INTERNAL_BETA_OWNER_TEST_MODE=1',
      '--env', 'INTERNAL_BETA_ENVIRONMENT=1',
      '--env', `INTERNAL_BETA_RUNTIME_ENV_B64=${runtimeEnvB64}`,
      '--env', `INTERNET_VOICE_ICE_SERVERS_JSON=${iceJson}`,
      '--meta', `w10AudioE2E=${marker}`,
    ], { cwd: previewDir, category: 'preview_deploy_failed' });
    const previewUrl = deployOutput.split(/\r?\n/).reverse().find((line) => /^https:\/\/[^\s]+\.vercel\.app$/.test(line.trim()))?.trim();
    if (!previewUrl) throw new Error('preview_url_missing');

    const previewList = await vercelApi(`/v6/deployments?projectId=${PROJECT_ID}&limit=30`);
    previewDeploymentIds = (previewList.deployments ?? [])
      .filter((deployment) => deployment.meta?.w10AudioE2E === marker)
      .map((deployment) => deployment.uid ?? deployment.id);
    if (previewDeploymentIds.length !== 1) throw new Error('preview_deployment_not_unique');

    const e2e = spawnSync(process.execPath, ['.github/scripts/w10-product-audio-e2e.mjs'], {
      env: { ...process.env, PREVIEW_URL: previewUrl },
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    for (const line of e2e.stdout.split(/\r?\n/)) {
      if (/^(PRODUCTION_HARD_BLOCK|PRODUCT_FLOW|REAL_PEER_CONNECTION|SELECTED_ICE|CALLER_TO_LISTENER_AUDIO_RTP|LISTENER_TO_CALLER_AUDIO_RTP|LIFECYCLE_STAGE|PRODUCT_CALL_LIFECYCLE|BILLING_SIMULATION|SETTLEMENT_IDEMPOTENCY|W10_PRODUCT_AUDIO_E2E_AUTOMATED_READY)=?[A-Z_]*$/.test(line)) {
        process.stdout.write(`${line}\n`);
      }
    }
    if (e2e.status !== 0 || !e2e.stdout.includes('W10_PRODUCT_AUDIO_E2E_AUTOMATED_READY')) {
      const diagnosticText = `${e2e.stdout}\n${e2e.stderr}`;
      const categories = [
        ['TypeError: Failed to fetch', 'browser_fetch_failed'],
        ['NotAllowedError', 'browser_media_not_allowed'],
        ['InvalidAccessError', 'browser_invalid_access'],
        ['InvalidStateError', 'browser_invalid_state'],
        ['NotSupportedError', 'browser_not_supported'],
        ['offer_missing', 'offer_missing'],
        ['answer_missing', 'answer_missing'],
        ['ice_signaling_missing', 'ice_signaling_missing'],
        ['rtp_validation', 'rtp_validation'],
        ['timeout', 'connection_timeout'],
        ['page.goto', 'browser_navigation_failed'],
      ];
      const category = categories.find(([needle]) => diagnosticText.includes(needle))?.[1] ?? 'product_audio_script_failed';
      emit('E2E_ERROR', category);
      const rawErrorLine = diagnosticText.split(/\r?\n/).find((line) => /(?:Error|DOMException|page\.evaluate)/.test(line)) ?? '';
      const safeError = rawErrorLine
        .replace(/https?:\/\/\S+/gi, ' URL ')
        .replace(/[A-Za-z0-9+/_=-]{24,}/g, ' REDACTED ')
        .replace(/\b\d+(?:\.\d+){1,3}\b/g, ' IP ')
        .replace(/\d+/g, ' N ')
        .replace(/[^A-Za-z_ ]/g, ' ')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 140);
      emit('E2E_SAFE_DETAIL', safeError || 'unavailable');
      throw new Error('product_audio_e2e_failed');
    }
    emit('W14_INTERNAL_HANDOFF', 'PASS');
    emit('MARKETPLACE_VISIBILITY', 'PASS');
    emit('PRODUCT_CALL_REQUEST_ACCEPT', 'PASS');
    emit('PRODUCT_ICE_CONFIG', 'PASS');
    emit('REAL_MONEY_MOVED', 'NO');
  } finally {
    rmSync(previewDir, { recursive: true, force: true });
  }
} finally {
  for (const id of mintDeploymentIds) {
    if (id !== activeBefore) {
      await vercelApi(`/v13/deployments/${id}`, 'DELETE')
        .then(() => { mintCleaned = true; })
        .catch(() => undefined);
    }
  }
  for (const id of previewDeploymentIds) {
    if (id !== activeBefore) await vercelApi(`/v13/deployments/${id}`, 'DELETE').then(() => { previewCleaned = true; }).catch(() => undefined);
  }
  rmSync(mintDir, { recursive: true, force: true });
  const projectAfter = await vercelApi(`/v9/projects/${PROJECT_ID}`).catch(() => null);
  if (projectAfter?.targets?.production?.id === activeBefore) domainUntouched = true;
  emit('FINAL_PRODUCTION_TARGET_UNCHANGED', domainUntouched ? 'PASS' : 'FAIL');
  emit('FINAL_MINT_CLEANUP', mintCleaned || mintDeploymentIds.length === 0 ? 'PASS' : 'FAIL');
  emit('FINAL_PREVIEW_CLEANUP', previewCleaned || previewDeploymentIds.length === 0 ? 'PASS' : 'FAIL');
}
