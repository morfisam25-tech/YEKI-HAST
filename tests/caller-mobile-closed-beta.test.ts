import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../apps/mobile/src/api.ts', import.meta.url), 'utf8');
const caller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../apps/mobile/App.tsx', import.meta.url), 'utf8');

test('caller API contract matches listener browse response ids', () => {
  assert.match(api, /export type BrowseListener = \{\s*id: string;/);
  assert.doesNotMatch(api, /export type BrowseListener = \{\s*userId: string;/);
});

test('closed-beta caller shell requires explicit current age, Terms and safety consent before browse flow', () => {
  const consent = caller.indexOf('await confirmCallerAge(token, { termsAccepted, safetyAccepted })');
  const browse = caller.indexOf('await browseListeners(token');
  assert.ok(consent >= 0 && browse > consent);
  assert.match(caller, /const policiesReady = ageConfirmed && termsAccepted && safetyAccepted/);
  assert.match(caller, /disabled=\{busy \|\| !policiesReady\}/);
  assert.match(caller, /قوانین استفاده را خواندم و می‌پذیرم/);
  assert.match(caller, /اینجا محل دوست‌یابی یا مشاوره تخصصی نیست/);
  assert.match(api, /termsAccepted: input\.termsAccepted/);
  assert.match(api, /safetyAccepted: input\.safetyAccepted/);
  assert.match(caller, /stage === 'age-gate'/);
});

test('closed-beta caller shell exposes request plus real Internet Voice start, end and safety clients', () => {
  assert.match(caller, /await requestCall\(token/);
  assert.match(caller, /const startedCallId = requested\.callId/);
  assert.match(caller, /await startInternetVoiceCall\(token, startedCallId\)/);
  assert.match(caller, /await endInternetVoiceCall\(token, call\.callId\)/);
  assert.match(caller, /await safetyExitInternetVoiceCall\(token, call\.callId\)/);
  assert.doesNotMatch(caller, /dispatchCall\(/);
});

test('closed-test caller shell avoids obsolete beta and test-profile copy', () => {
  assert.doesNotMatch(caller, /بتای Caller|حساب آزمایشی/);
  assert.match(caller, /مسیر تماس‌گیرنده برای این محیط فعال نیست/);
  assert.match(caller, /جزئیات پروفایل خوداظهاری است/);
});

test('public app navigation is driven by the fail-closed server bootstrap flag', () => {
  assert.match(app, /import CallerClosedBetaScreen from '\.\/src\/CallerClosedBetaScreen'/);
  assert.match(app, /const \[callerBetaEnabled, setCallerBetaEnabled\] = useState\(false\)/);
  assert.match(app, /setCallerBetaEnabled\(bootstrap\.features\?\.callerClosedBetaEnabled === true\)/);
  assert.match(app, /\.catch\(\(\) => \{\s*if \(disposed\) return;\s*setCallerBetaEnabled\(false\)/);
  assert.match(app, /if \(!callerBetaEnabled\) \{\s*setScreen\('waitlist'\)/);
});

test('Caller and Listener share account auth plumbing but keep separate post-auth destinations', () => {
  assert.match(app, /type AuthPurpose = 'listener' \| 'caller'/);
  assert.match(app, /if \(authPurpose === 'caller'\)[\s\S]*setScreen\('caller-beta'\)/);
  assert.match(app, /await resumeListener\(session\.token\)/);
  assert.match(app, /screen === 'caller-beta' && token/);
  assert.match(app, /<CallerClosedBetaScreen token=\{token\}/);
});
