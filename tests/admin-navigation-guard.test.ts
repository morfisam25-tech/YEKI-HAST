import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../apps/admin/app/layout.tsx', import.meta.url), 'utf8');

for (const [path, label] of [
  ['/', 'داشبورد'],
  ['/calls', 'تماس‌ها'],
  ['/safety', 'ایمنی'],
  ['/waitlist', 'صف Caller'],
  ['/payments', 'شارژها'],
  ['/payouts', 'تسویه‌ها'],
  ['/readiness', 'آمادگی'],
] as const) {
  test(`admin navigation keeps ${path}`, () => {
    assert.match(layout, new RegExp(`href=\\"${path.replace('/', '\\/')}\\"`));
    assert.match(layout, new RegExp(label));
  });
}

test('admin navigation stays usable on narrow screens', () => {
  assert.match(layout, /overflowX: 'auto'/);
  assert.match(layout, /whiteSpace: 'nowrap'/);
});
