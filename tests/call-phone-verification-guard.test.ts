import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const account = await readFile(new URL('../services/api/src/routes/account-contact.ts', import.meta.url), 'utf8');
const admin = await readFile(new URL('../services/api/src/routes/admin-contact.ts', import.meta.url), 'utf8');
const readiness = await readFile(new URL('../services/api/src/routes/admin-readiness.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const caller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const listener = await readFile(new URL('../apps/mobile/src/ListenerWorkScreen.tsx', import.meta.url), 'utf8');
const card = await readFile(new URL('../apps/mobile/src/CallPhoneSetupCard.tsx', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../apps/admin/app/phone-verifications/page.tsx', import.meta.url), 'utf8');


test('call phone is encrypted, unique by hash, and changing number clears verification', () => {
  assert.match(account, /encryptPrivateText\(phone/);
  assert.match(account, /phoneHash\(phone\)/);
  assert.match(account, /phone_verified_at=CASE/);
  assert.match(account, /WHEN private_data\.user_contacts\.phone_hash=EXCLUDED\.phone_hash/);
  assert.match(account, /ELSE NULL/);
  assert.match(account, /phone_already_registered/);
});

test('manual phone verification is closed-beta-only and explicitly confirmed', () => {
  assert.match(admin, /MANUAL_PHONE_VERIFICATION_BETA_ENABLED/);
  assert.match(admin, /body\.confirmed !== true/);
  assert.match(admin, /manual_beta_phone_verified/);
  assert.match(admin, /admin_out_of_band/);
  assert.match(admin, /requireAdmin\(req\)/);
});

test('handler exposes authenticated phone setup and admin verification operations', () => {
  assert.match(handler, /\/v1\/account\/call-phone/);
  assert.match(handler, /\/v1\/admin\/call-phone-verifications/);
  assert.match(handler, /call-phone\\\/verify/);
});

test('caller cannot progress to a new call path before call phone verification', () => {
  assert.match(caller, /const \[callPhoneVerified, setCallPhoneVerified\] = useState\(false\)/);
  assert.match(caller, /<CallPhoneSetupCard token=\{token\} onVerifiedChange=\{setCallPhoneVerified\} \/>/);
  assert.match(caller, /recoveryBlocked \|\| !callPhoneVerified/);
  assert.match(caller, /callPhoneVerified && stage === 'age-gate'/);
  assert.match(caller, /callPhoneVerified && stage === 'browse'/);
});

test('listener work controls fail closed without a verified phone but offline stays available', () => {
  assert.match(listener, /const \[callPhoneVerified, setCallPhoneVerified\] = useState\(false\)/);
  assert.match(listener, /!callPhoneVerified && status !== 'offline'/);
  assert.match(listener, /const workControlsLocked = busy \|\| activeCallConflict \|\| !callPhoneVerified/);
  assert.match(listener, /<CallPhoneSetupCard token=\{token\} onVerifiedChange=\{setCallPhoneVerified\} \/>/);
  assert.match(listener, /disabled=\{busy\} onPress=\{\(\) => changeStatus\('offline'\)\}/);
});

test('mobile phone card never claims a pending number is verified', () => {
  assert.match(card, /status\?\.configured && !status\.verified/);
  assert.match(card, /ادمین بعد از بررسی مالکیت شماره آن را فعال می‌کند/);
  assert.doesNotMatch(card, /verified:\s*true/);
});

test('admin UI warns that ownership must be checked out of band before confirmation', () => {
  assert.match(adminPage, /فقط در بتای بسته و بعد از بررسی واقعی مالکیت شماره خارج از سیستم/);
  assert.match(adminPage, /window\.confirm/);
  assert.match(adminPage, /confirmed: true/);
});

test('SMS is no longer a hard caller launch dependency when email and manual beta verification are ready', () => {
  assert.match(readiness, /const accountAuthReady = emailAuthReady \|\| smsReady/);
  assert.match(readiness, /const callPhoneVerificationReady = manualPhoneVerificationEnabled \|\| smsReady/);
  const callerLaunchBlock = readiness.match(/const callerLaunchReady =[\s\S]*?;/)?.[0] ?? '';
  assert.match(callerLaunchBlock, /accountAuthReady/);
  assert.match(callerLaunchBlock, /callPhoneVerificationReady/);
  assert.doesNotMatch(callerLaunchBlock, /&& smsReady/);
});
