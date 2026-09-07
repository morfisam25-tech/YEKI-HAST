from pathlib import Path

kyc_path = Path('services/api/src/routes/kyc.ts')
kyc = kyc_path.read_text()
old_auth = """export async function submitListenerKyc(req: IncomingMessage, res: ServerResponse) {
  // Do not collect identity/banking payloads while the real inquiry provider is disabled.
  // Technical beta keeps KYC provider selectors blank, so this fails before body parsing
  // and before any sensitive-data write.
  requireKycSubmissionProvider();

  const { userId } = await requireAuth(req);
  const body = await readJson<{
"""
new_auth = """export async function submitListenerKyc(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);

  // Do not collect identity/banking payloads while the real inquiry provider is disabled.
  // Authentication happens first so unauthenticated callers cannot probe provider readiness;
  // provider validation still happens before body parsing and before sensitive-data writes.
  requireKycSubmissionProvider();

  const body = await readJson<{
"""
if old_auth not in kyc:
    raise SystemExit('KYC auth/provider ordering target not found')
kyc = kyc.replace(old_auth, new_auth, 1)

old_current = """      if (current.rows[0]?.status === 'verified') throw new HttpError(409, 'kyc_already_verified');

      const legalNameCiphertext = encryptPrivateText(legalName, `listener_kyc:legal_name:${userId}`);
"""
new_current = """      if (current.rows[0]?.status === 'verified') throw new HttpError(409, 'kyc_already_verified');
      if (current.rows[0]?.status === 'pending') throw new HttpError(409, 'kyc_pending_review');

      const legalNameCiphertext = encryptPrivateText(legalName, `listener_kyc:legal_name:${userId}`);
"""
if old_current not in kyc:
    raise SystemExit('KYC current-state target not found')
kyc_path.write_text(kyc.replace(old_current, new_current, 1))

admin_path = Path('services/api/src/routes/admin-kyc.ts')
admin = admin_path.read_text()
old_admin = """    if (!row.kyc_status || row.kyc_status === 'not_started') throw new HttpError(409, 'kyc_not_submitted');
    if (row.kyc_status === 'verified') throw new HttpError(409, 'kyc_already_verified');

    // Manual admin review may reject/expire evidence, but it can never create
"""
new_admin = """    if (!row.kyc_status || row.kyc_status === 'not_started') throw new HttpError(409, 'kyc_not_submitted');
    if (row.kyc_status === 'verified') throw new HttpError(409, 'kyc_already_verified');
    if (row.kyc_status !== 'pending') throw new HttpError(409, 'kyc_not_pending');

    // Manual admin review may reject/expire evidence, but it can never create
"""
if old_admin not in admin:
    raise SystemExit('admin KYC state target not found')
admin_path.write_text(admin.replace(old_admin, new_admin, 1))

web_path = Path('apps/web/app/listener/page.tsx')
web = web_path.read_text()
old_web_messages = """    kyc_not_configured: 'ثبت امن اطلاعات هویتی در این محیط هنوز فعال نشده است.',
    kyc_not_available: 'مرحله احراز هویت هنوز برای این درخواست باز نشده است.',
    kyc_already_verified: 'احراز هویت قبلاً تأیید شده است.',
"""
new_web_messages = """    kyc_not_configured: 'ثبت امن اطلاعات هویتی در این محیط هنوز فعال نشده است.',
    kyc_provider_not_configured: 'سرویس استعلام واقعی احراز هویت هنوز در این محیط فعال نشده است.',
    kyc_not_available: 'مرحله احراز هویت هنوز برای این درخواست باز نشده است.',
    kyc_already_verified: 'احراز هویت قبلاً تأیید شده است.',
    kyc_pending_review: 'اطلاعات احراز هویت قبلاً ثبت شده و هنوز در حال بررسی است.',
"""
if old_web_messages not in web:
    raise SystemExit('Web KYC messages target not found')
web_path.write_text(web.replace(old_web_messages, new_web_messages, 1))

mobile_kyc_path = Path('apps/mobile/src/ListenerKycScreen.tsx')
mobile_kyc = mobile_kyc_path.read_text()
old_mobile_messages = """    kyc_not_configured: 'ثبت امن اطلاعات هویتی هنوز روی این محیط فعال نشده.',
    kyc_not_available: 'مرحله احراز هویت هنوز برای این درخواست باز نشده.',
    kyc_already_verified: 'احراز هویت قبلاً تأیید شده است.',
"""
new_mobile_messages = """    kyc_not_configured: 'ثبت امن اطلاعات هویتی هنوز روی این محیط فعال نشده.',
    kyc_provider_not_configured: 'سرویس استعلام واقعی احراز هویت هنوز روی این محیط فعال نشده.',
    kyc_not_available: 'مرحله احراز هویت هنوز برای این درخواست باز نشده.',
    kyc_already_verified: 'احراز هویت قبلاً تأیید شده است.',
    kyc_pending_review: 'اطلاعات احراز هویت قبلاً ثبت شده و هنوز در حال بررسی است.',
"""
if old_mobile_messages not in mobile_kyc:
    raise SystemExit('Mobile KYC messages target not found')
mobile_kyc_path.write_text(mobile_kyc.replace(old_mobile_messages, new_mobile_messages, 1))

training_path = Path('apps/mobile/src/ListenerTrainingScreen.tsx')
training = training_path.read_text()
anchor = """  if (['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(application.status)) {
    return <ListenerKycScreen token={token} onDone={onDone} />;
  }

  return (
"""
replacement = """  if (['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(application.status)) {
    return <ListenerKycScreen token={token} onDone={onDone} />;
  }

  if (['agreement_pending', 'admin_review', 'mock_call', 'suspended', 'rejected', 'archived'].includes(application.status)) {
    const labels: Record<string, string> = {
      agreement_pending: 'در انتظار قرارداد',
      admin_review: 'در بررسی نهایی',
      mock_call: 'در مرحله تماس آزمایشی',
      suspended: 'حساب معلق است',
      rejected: 'درخواست رد شده است',
      archived: 'درخواست بایگانی شده است',
    };
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{labels[application.status] ?? 'وضعیت درخواست'}</Text>
        <Text style={styles.body}>
          این مرحله از داخل برنامه قابل تغییر نیست. آموزش یا آزمون قبلی فقط وقتی دوباره باز می‌شود که وضعیت واقعی سرور به مرحله قابل‌ویرایش برگردد.
        </Text>
        <TouchableOpacity onPress={onDone} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>برگشت</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
"""
if anchor not in training:
    raise SystemExit('Mobile review-only state anchor not found')
training_path.write_text(training.replace(anchor, replacement, 1))

test_path = Path('tests/listener-kyc-mobile-state-guard.test.ts')
test_path.write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const kycRoute = await readFile(new URL('../services/api/src/routes/kyc.ts', import.meta.url), 'utf8');
const adminKyc = await readFile(new URL('../services/api/src/routes/admin-kyc.ts', import.meta.url), 'utf8');
const webOnboarding = await readFile(new URL('../apps/web/app/listener/page.tsx', import.meta.url), 'utf8');
const mobileKyc = await readFile(new URL('../apps/mobile/src/ListenerKycScreen.tsx', import.meta.url), 'utf8');
const mobileTraining = await readFile(new URL('../apps/mobile/src/ListenerTrainingScreen.tsx', import.meta.url), 'utf8');

test('KYC submission authenticates before provider readiness and cannot overwrite pending review', () => {
  const authIndex = kycRoute.indexOf('const { userId } = await requireAuth(req);');
  const providerIndex = kycRoute.indexOf('requireKycSubmissionProvider();');
  assert.ok(authIndex >= 0 && providerIndex > authIndex);
  assert.match(kycRoute, /current\.rows\[0\]\?\.status === 'pending'/);
  assert.match(kycRoute, /kyc_pending_review/);
});

test('manual admin KYC action is limited to pending evidence', () => {
  assert.match(adminKyc, /row\.kyc_status !== 'pending'/);
  assert.match(adminKyc, /kyc_not_pending/);
  assert.match(adminKyc, /it can never create[\s\S]*a verified identity/);
});

test('Web and Mobile expose explicit provider-disabled and pending-review KYC states', () => {
  for (const source of [webOnboarding, mobileKyc]) {
    assert.match(source, /kyc_provider_not_configured/);
    assert.match(source, /kyc_pending_review/);
  }
});

test('Mobile Listener keeps post-onboarding states read-only instead of replaying training', () => {
  assert.match(mobileTraining, /agreement_pending/);
  assert.match(mobileTraining, /admin_review/);
  assert.match(mobileTraining, /mock_call/);
  assert.match(mobileTraining, /suspended/);
  assert.match(mobileTraining, /rejected/);
  assert.match(mobileTraining, /archived/);
  assert.match(mobileTraining, /این مرحله از داخل برنامه قابل تغییر نیست/);
});
""")
