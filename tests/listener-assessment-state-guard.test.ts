import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const listenerRoute = await readFile(new URL('../services/api/src/routes/listener.ts', import.meta.url), 'utf8');
const webOnboarding = await readFile(new URL('../apps/web/app/listener/page.tsx', import.meta.url), 'utf8');

test('listener assessment API allows only one pending review per application', () => {
  assert.match(listenerRoute, /WHERE application_id=\$1 AND result='pending'/);
  assert.match(listenerRoute, /assessment_pending_review/);
  assert.match(listenerRoute, /FOR UPDATE/);
});

test('Web Listener permits a new assessment after a real failed review', () => {
  assert.match(webOnboarding, /!assessment \|\| assessment\.result === 'failed'/);
  assert.match(webOnboarding, /ارسال ارزیابی/);
  assert.match(webOnboarding, /نیاز به مرور بیشتر/);
});

test('Web Listener keeps non-onboarding application states fail-closed', () => {
  assert.match(webOnboarding, /\['exploring', 'training', 'assessment'\]\.includes\(application\.status\)/);
  assert.match(webOnboarding, /reviewOnly/);
  assert.match(webOnboarding, /agreement_pending: 'در انتظار مرحله توافق'/);
  assert.match(webOnboarding, /admin_review: 'در بررسی نهایی'/);
  assert.match(webOnboarding, /suspended: 'موقتاً غیرفعال'/);
  assert.match(webOnboarding, /درخواست شما در مرحله بررسی است/);
});
