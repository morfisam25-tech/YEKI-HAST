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

test('handler keeps authenticated phone setup and admin verification available for masked PSTN fallback', () => {
  assert.match(handler, /\/v1\/account\/call-phone/);
  assert.match(handler, /\/v1\/admin\/call-phone-verifications/);
  assert.match(handler, /call-phone\\\/verify/);
});

test('Internet Voice caller path is not gated on verified PSTN phone setup', () => {
  assert.doesNotMatch(caller, /const \[callPhoneVerified, setCallPhoneVerified\] = useState\(false\)/);
  assert.doesNotMatch(caller, /recoveryBlocked \|\| !callPhoneVerified/);
  assert.doesNotMatch(caller, /callPhoneVerified && stage === 'age-gate'/);
  assert.doesNotMatch(caller, /callPhoneVerified && stage === 'browse'/);
  assert.doesNotMatch(caller, /<CallPhoneSetupCard token=\{token\} onVerifiedChange=\{setCallPhoneVerified\} \/>/);
});

test('Internet Voice listener work mode is not gated on verified PSTN phone setup', () => {
  assert.doesNotMatch(listener, /const \[callPhoneVerified, setCallPhoneVerified\] = useState\(false\)/);
  assert.doesNotMatch(listener, /!callPhoneVerified && status !== 'offline'/);
  assert.doesNotMatch(listener, /const workControlsLocked = busy \|\| activeCallConflict \|\| !callPhoneVerified/);
  assert.doesNotMatch(listener, /<CallPhoneSetupCard token=\{token\} onVerifiedChange=\{setCallPhoneVerified\} \/>/);
  assert.match(listener, /آماده دریافت تماس اینترنتی/);
});

test('mobile phone card never claims a pending fallback number is verified', () => {
  assert.match(card, /status\?\.configured && !status\.verified/);
  assert.match(card, /ادمین بعد از بررسی مالکیت شماره آن را فعال می‌کند/);
  assert.doesNotMatch(card, /verified:\s*true/);
});

test('admin UI warns that fallback phone ownership must be checked out of band before confirmation', () => {
  assert.match(adminPage, /فقط در بتای بسته و بعد از بررسی واقعی مالکیت شماره خارج از سیستم/);
  assert.match(adminPage, /window\.confirm/);
  assert.match(adminPage, /confirmed: true/);
});

test('Caller launch readiness follows primary call transport and does not require PSTN readiness for Internet Voice', () => {
  assert.match(readiness, /const accountAuthReady = emailAuthReady \|\| smsReady/);
  assert.match(readiness, /const callTransportReady = ready\(\(\) => validatePrimaryCallTransportEnv\(\)\)/);
  assert.match(readiness, /const maskedPstnLaunchRequired = callTransport\?\.primary === 'masked_pstn'/);
  const callerLaunchBlock = readiness.match(/const callerLaunchReady =[\s\S]*?;/)?.[0] ?? '';
  assert.match(callerLaunchBlock, /accountAuthReady/);
  assert.match(callerLaunchBlock, /callTransportReady/);
  assert.doesNotMatch(callerLaunchBlock, /callPhoneVerificationReady/);
  assert.doesNotMatch(callerLaunchBlock, /telephonyReady/);
});
