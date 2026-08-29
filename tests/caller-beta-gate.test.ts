import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const gateSource = readFileSync(new URL('../services/api/src/lib/caller-beta.ts', import.meta.url), 'utf8');
const handlerSource = readFileSync(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const bootstrapSource = readFileSync(new URL('../services/api/src/routes/bootstrap.ts', import.meta.url), 'utf8');
const lightweightBootstrapSource = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');

test('Caller beta configuration and commercial hosting approval are explicit true-only switches', () => {
  assert.match(gateSource, /CALLER_CLOSED_BETA_ENABLED\?\.trim\(\)\.toLowerCase\(\) === 'true'/);
  assert.match(gateSource, /COMMERCIAL_HOSTING_APPROVED\?\.trim\(\)\.toLowerCase\(\) === 'true'/);
  assert.doesNotMatch(gateSource, /=== '1'|=== 'yes'/);
});

test('effective production Caller beta requires both configuration and commercial hosting approval', () => {
  assert.match(gateSource, /if \(!isCallerClosedBetaConfigured\(\)\) return false/);
  assert.match(gateSource, /if \(process\.env\.NODE_ENV !== 'production'\) return true/);
  assert.match(gateSource, /return isCommercialHostingApproved\(\)/);
  assert.match(gateSource, /commercial_hosting_not_approved/);
  assert.match(gateSource, /caller_closed_beta_disabled/);
});

test('API boundary gates Caller entry and call-start routes but preserves escape routes', () => {
  const ageGateLine = handlerSource.match(/if \(method === 'POST' && url\.pathname === '\/v1\/caller\/age-gate'\)[^\n]+/)?.[0] ?? '';
  const browseLine = handlerSource.match(/if \(method === 'GET' && url\.pathname === '\/v1\/listeners'\)[^\n]+/)?.[0] ?? '';
  const requestLine = handlerSource.match(/if \(method === 'POST' && url\.pathname === '\/v1\/calls\/request'\)[^\n]+/)?.[0] ?? '';
  const dispatchLine = handlerSource.match(/if \(method === 'POST' && dispatchMatch\)[^\n]+/)?.[0] ?? '';

  assert.match(ageGateLine, /requireCallerClosedBetaEnabled\(\)/);
  assert.match(browseLine, /requireCallerClosedBetaEnabled\(\)/);
  assert.match(requestLine, /requireCallerClosedBetaEnabled\(\)/);
  assert.match(dispatchLine, /requireCallerClosedBetaEnabled\(\)/);

  const cancelLine = handlerSource.match(/if \(method === 'POST' && cancelMatch\)[^\n]+/)?.[0] ?? '';
  const safetyLine = handlerSource.match(/if \(method === 'POST' && safetyExitMatch\)[^\n]+/)?.[0] ?? '';
  const getLine = handlerSource.match(/if \(method === 'GET' && callMatch\)[^\n]+/)?.[0] ?? '';
  assert.doesNotMatch(cancelLine, /requireCallerClosedBetaEnabled/);
  assert.doesNotMatch(safetyLine, /requireCallerClosedBetaEnabled/);
  assert.doesNotMatch(getLine, /requireCallerClosedBetaEnabled/);
});

test('both bootstrap entrypoints expose only the effective Caller beta switch', () => {
  for (const source of [bootstrapSource, lightweightBootstrapSource]) {
    assert.match(source, /isCallerClosedBetaEnabled/);
    assert.match(source, /callerClosedBetaEnabled:\s*isCallerClosedBetaEnabled\(\)/);
  }
});
