import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mobileRoot = await readFile(new URL('../apps/mobile/RootApp.tsx', import.meta.url), 'utf8');
const adminReadiness = await readFile(new URL('../apps/admin/app/readiness/page.tsx', import.meta.url), 'utf8');

test('mobile safety boundary is not conditional on legal-link availability', () => {
  assert.match(mobileRoot, /یکی هست جایگزین درمان، مشاوره تخصصی یا خدمات اضطراری نیست/);
  const boundaryIndex = mobileRoot.indexOf('یکی هست جایگزین درمان');
  const conditionalLinksIndex = mobileRoot.indexOf('{hasAnyLink && (');
  assert.ok(boundaryIndex > -1);
  assert.ok(conditionalLinksIndex > boundaryIndex, 'legal-link condition must occur after the always-visible safety boundary');
});

test('Admin readiness explains every non-provider Caller release gate', () => {
  assert.match(adminReadiness, /publicReleasePolicy/);
  assert.match(adminReadiness, /privacyPolicyReady/);
  assert.match(adminReadiness, /termsOfServiceReady/);
  assert.match(adminReadiness, /accountDeletionReady/);
  assert.match(adminReadiness, /supportReady/);
  assert.match(adminReadiness, /adminBootstrap\.lockedDown/);
  assert.match(adminReadiness, /adminBootstrap\.windowOpen/);
  assert.match(adminReadiness, /صفحات و پشتیبانی عمومی/);
  assert.match(adminReadiness, /قفل‌بودن کامل bootstrap ادمین/);
});
