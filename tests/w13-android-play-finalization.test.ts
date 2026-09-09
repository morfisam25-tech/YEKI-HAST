import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('apps/mobile/App.tsx', 'utf8');
const rootApp = fs.readFileSync('apps/mobile/RootApp.tsx', 'utf8');
const emailAuth = fs.readFileSync('apps/mobile/src/EmailAuthScreen.tsx', 'utf8');
const theme = fs.readFileSync('apps/mobile/src/theme.ts', 'utf8');
const appJson = fs.readFileSync('apps/mobile/app.json', 'utf8');
const childSafety = fs.readFileSync('apps/web/app/safety/children/page.tsx', 'utf8');

test('Android primary surfaces use the frozen W9 palette and brand lockup', () => {
  assert.match(theme, /#0E1117/);
  assert.match(theme, /#F7EFE5/);
  assert.match(theme, /#E99C58/);
  assert.match(app, /یک انسان، برای شنیدن/);
  assert.match(app, /گاهی فقط لازم است یکی واقعاً گوش بدهد/);
  assert.match(app, /گفت‌وگوی عمومی فعلاً بسته است/);
});

test('Android public copy keeps Caller and payment closed and does not require a phone for login', () => {
  assert.match(app, /تماس یا پرداخت عمومی فعال نمی‌شود/);
  assert.match(emailAuth, /برای ورود رمز عبور یا شماره تلفن لازم نیست/);
  assert.doesNotMatch(emailAuth, /شماره موبایل فقط جداگانه برای تماس واقعی استفاده می‌شود/);
});

test('Android manifest config keeps microphone and blocks camera', () => {
  const config = JSON.parse(appJson);
  assert.equal(config.expo.android.package, 'app.yekihast.mobile');
  assert.ok(config.expo.android.permissions.includes('android.permission.RECORD_AUDIO'));
  assert.ok(config.expo.android.blockedPermissions.includes('android.permission.CAMERA'));
});

test('Child Safety standards are public, explicit and linked from Android', () => {
  assert.match(childSafety, /سوءاستفاده و بهره‌کشی جنسی از کودکان/);
  assert.match(childSafety, /CSAM/);
  assert.match(childSafety, /NCMEC/);
  assert.match(childSafety, /sales@uniqueholding\.com\.tr/);
  assert.match(app, /https:\/\/yekihast\.app\/safety\/children/);
  assert.match(rootApp, /https:\/\/yekihast\.app\/safety\/children/);
});
