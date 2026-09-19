import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  getErrorCode,
  getListenerKycStatus,
  submitListenerKyc,
  type ListenerKycStatusResponse,
} from './api';
import {
  acceptListenerAgreement,
  getListenerAgreementErrorCode,
} from './listener-agreement-api';

type Props = {
  token: string;
  onDone: () => void;
};

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    kyc_not_configured: 'ثبت امن اطلاعات هویتی هنوز روی این محیط فعال نشده.',
    kyc_provider_not_configured: 'سرویس استعلام واقعی احراز هویت هنوز روی این محیط فعال نشده.',
    kyc_not_available: 'مرحله احراز هویت هنوز برای این درخواست باز نشده.',
    kyc_already_verified: 'موارد لازم برای این حساب قبلاً با موفقیت بررسی شده‌اند.',
    kyc_pending_review: 'اطلاعات احراز هویت قبلاً ثبت شده و هنوز در حال بررسی است.',
    invalid_legal_name: 'نام و نام خانوادگی را مطابق مدرک هویتی وارد کن.',
    invalid_national_id: 'کد ملی معتبر نیست.',
    invalid_date_of_birth: 'تاریخ تولد شمسی معتبر نیست.',
    date_of_birth_mismatch: 'تاریخ تولد با اطلاعات قبلی همخوان نیست.',
    invalid_bank_iban: 'شماره شبا معتبر نیست.',
    national_id_already_registered: 'این کد ملی قبلاً برای حساب دیگری ثبت شده است.',
    kyc_identity_conflict: 'اطلاعات هویتی با حساب دیگری تداخل دارد.',
    listener_agreement_not_available: 'مرحله پذیرش قوانین هنوز برای این درخواست باز نشده.',
    listener_agreement_not_accepted: 'برای ادامه باید پذیرش صریح قوانین را علامت بزنی.',
    listener_kyc_incomplete: 'بررسی‌های لازم KYC هنوز کامل نشده‌اند.',
    listener_agreement_evidence_missing: 'مدرک پذیرش قبلی پیدا نشد؛ ادامه متوقف شد.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

const kycCheckLabels: Record<string, string> = {
  national_id_dob_match: 'تطبیق کد ملی و تاریخ تولد',
  iban_inquiry: 'استعلام شبا/حساب بانکی',
};

const kycCheckStatusLabels: Record<string, string> = {
  not_checked: 'هنوز بررسی نشده',
  pending: 'در حال بررسی',
  verified: 'با موفقیت انجام شد',
  failed: 'ناموفق',
  error: 'خطای سرویس، نامشخص',
};

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export default function ListenerKycScreen({ token, onDone }: Props) {
  const [status, setStatus] = useState<ListenerKycStatusResponse | null>(null);
  const [legalName, setLegalName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [birthJalali, setBirthJalali] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setStatus(await getListenerKycStatus(token));
  }

  useEffect(() => {
    refresh().catch((cause) => setError(messageFor(getErrorCode(cause))));
  }, [token]);

  const normalizedNationalId = normalizeDigits(nationalId).replace(/\D/g, '').slice(0, 10);
  const normalizedBirth = normalizeDigits(birthJalali).replace(/[/.]/g, '-').replace(/[^\d-]/g, '').slice(0, 10);
  const normalizedIban = normalizeDigits(iban).replace(/[\s-]/g, '').toUpperCase().slice(0, 26);
  const canSubmit = useMemo(
    () => legalName.trim().length >= 2 && /^\d{10}$/.test(normalizedNationalId) && /^\d{4}-\d{2}-\d{2}$/.test(normalizedBirth) && /^IR\d{24}$/.test(normalizedIban),
    [legalName, normalizedNationalId, normalizedBirth, normalizedIban],
  );

  async function submit() {
    if (!canSubmit || busy) return;
    setError('');
    setBusy(true);
    try {
      await submitListenerKyc(token, {
        legalName: legalName.trim(),
        nationalId: normalizedNationalId,
        dateOfBirthJalali: normalizedBirth,
        bankIban: normalizedIban,
        bankAccountHolder: accountHolder.trim() || undefined,
      });
      await refresh();
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function acceptAgreement() {
    if (!agreementAccepted || busy) return;
    setError('');
    setBusy(true);
    try {
      await acceptListenerAgreement(token);
      setAgreementAccepted(false);
      await refresh();
    } catch (cause) {
      setError(messageFor(getListenerAgreementErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>احراز هویت شنونده</Text>
        <Text style={styles.body}>{error || 'در حال بارگذاری…'}</Text>
      </View>
    );
  }

  if (status.status === 'pending') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>اطلاعاتت ثبت شد</Text>
        <Text style={styles.body}>اطلاعات هویتی به‌صورت خصوصی ثبت شده و در انتظار استعلام است. Caller هیچ‌کدام از این اطلاعات را نمی‌بیند.</Text>
        <View style={styles.notice}><Text style={styles.noticeText}>وضعیت: در انتظار بررسی</Text></View>
        <TouchableOpacity style={styles.secondaryButton} onPress={onDone}><Text style={styles.secondaryText}>برگشت به خانه</Text></TouchableOpacity>
      </View>
    );
  }

  if (status.status === 'verified') {
    const agreementReady = status.applicationStatus === 'agreement_pending' || status.applicationStatus === 'kyc_pending';
    const agreementPast = ['admin_review', 'approved', 'active'].includes(status.applicationStatus);
    return (
      <View style={styles.card}>
        <Text style={styles.title}>موارد لازم بررسی شدند</Text>
        {status.checks.map((check) => (
          <Text key={check.checkKind} style={styles.body}>
            {kycCheckLabels[check.checkKind] ?? check.checkKind}: {kycCheckStatusLabels[check.status] ?? check.status}
          </Text>
        ))}
        <Text style={styles.body}>این فقط همین موارد مشخص را تأیید می‌کند، نه احراز هویت کامل یا تصویر مدرک. اطلاعات واقعی تو خصوصی می‌ماند.</Text>

        {agreementReady && (
          <View style={styles.agreementBox}>
            <Text style={styles.sectionTitle}>پذیرش قوانین شنونده</Text>
            <Text style={styles.body}>برای ورود درخواست به بررسی نهایی ادمین، نسخه فعلی قوانین استفاده با شناسه terms-2026-09-13 را بخوان و صریحاً بپذیر.</Text>
            <TouchableOpacity onPress={() => { void Linking.openURL('https://yekihast.app/terms'); }}>
              <Text style={styles.link}>بازکردن قوانین استفاده</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreementAccepted, disabled: busy }}
              disabled={busy}
              style={[styles.checkRow, agreementAccepted && styles.checkRowActive]}
              onPress={() => setAgreementAccepted((current) => !current)}
            >
              <Text style={styles.checkText}>{agreementAccepted ? '☑' : '☐'} نسخه terms-2026-09-13 را خوانده‌ام و قوانین مربوط به فعالیت به‌عنوان شنونده را می‌پذیرم.</Text>
            </TouchableOpacity>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              disabled={!agreementAccepted || busy}
              onPress={() => { void acceptAgreement(); }}
              style={[styles.button, (!agreementAccepted || busy) && styles.disabled]}
            >
              <Text style={styles.buttonText}>{busy ? 'در حال ثبت…' : 'ثبت پذیرش و ارسال برای بررسی نهایی'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {agreementPast && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>پذیرش قوانین ثبت شده است. وضعیت درخواست: {status.applicationStatus}</Text>
          </View>
        )}

        {!agreementReady && !agreementPast && (
          <Text style={styles.body}>مرحله بعدی قرارداد و بررسی نهایی است. وضعیت واقعی درخواست را دوباره تازه کن.</Text>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={onDone}><Text style={styles.secondaryText}>برگشت</Text></TouchableOpacity>
      </View>
    );
  }

  const retrying = status.status === 'rejected' || status.status === 'expired';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>احراز هویت شنونده</Text>
      <Text style={styles.helper}>این اطلاعات فقط برای احراز، قرارداد و پرداخت نزد «یکی هست» می‌ماند و در پروفایل عمومی نمایش داده نمی‌شود.</Text>

      {retrying && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>اطلاعات قبلی نیاز به ثبت دوباره دارد{status.rejectedReasonCode ? ` — ${status.rejectedReasonCode}` : ''}.</Text>
        </View>
      )}

      <Text style={styles.label}>نام و نام خانوادگی مطابق مدرک</Text>
      <TextInput value={legalName} onChangeText={setLegalName} style={styles.input} textAlign="right" autoCorrect={false} />

      <Text style={styles.label}>کد ملی</Text>
      <TextInput
        value={nationalId}
        onChangeText={setNationalId}
        keyboardType="number-pad"
        placeholder="۱۰ رقم"
        style={styles.input}
        textAlign="right"
      />

      <Text style={styles.label}>تاریخ تولد شمسی</Text>
      <TextInput
        value={birthJalali}
        onChangeText={setBirthJalali}
        keyboardType="number-pad"
        placeholder="مثلاً ۱۳۷۰-۰۵-۲۱"
        style={styles.input}
        textAlign="right"
      />

      <Text style={styles.label}>شماره شبا</Text>
      <TextInput
        value={iban}
        onChangeText={setIban}
        autoCapitalize="characters"
        placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx"
        style={styles.input}
        textAlign="left"
      />

      <Text style={styles.label}>نام صاحب حساب (اگر با نام بالا فرق دارد)</Text>
      <TextInput value={accountHolder} onChangeText={setAccountHolder} style={styles.input} textAlign="right" />

      <Text style={styles.helper}>ثبت این فرم به معنی تأیید هویت نیست. وضعیت فقط بعد از استعلام واقعی تغییر می‌کند.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity disabled={!canSubmit || busy} onPress={submit} style={[styles.button, (!canSubmit || busy) && styles.disabled]}>
        <Text style={styles.buttonText}>{busy ? 'در حال ثبت امن…' : 'ثبت برای استعلام'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={onDone}><Text style={styles.secondaryText}>فعلاً بعداً</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', padding: 22, borderRadius: 22, gap: 13 },
  title: { color: '#20211f', textAlign: 'right', fontSize: 24, fontWeight: '800', lineHeight: 34 },
  sectionTitle: { color: '#20211f', textAlign: 'right', fontSize: 18, fontWeight: '800' },
  body: { color: '#66665f', textAlign: 'right', fontSize: 15, lineHeight: 25 },
  helper: { textAlign: 'right', color: '#84837c', fontSize: 13, lineHeight: 22 },
  label: { textAlign: 'right', color: '#20211f', fontWeight: '700', marginTop: 3 },
  input: { borderWidth: 1, borderColor: '#dedbd3', borderRadius: 14, padding: 14, fontSize: 16, color: '#20211f', backgroundColor: '#fbfaf7' },
  button: { backgroundColor: '#20211f', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, marginTop: 4 },
  buttonText: { color: '#ffffff', textAlign: 'center', fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: '#d8d5cd', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14 },
  secondaryText: { color: '#44453f', textAlign: 'center', fontWeight: '700' },
  notice: { backgroundColor: '#eef3ea', padding: 14, borderRadius: 14 },
  noticeText: { color: '#34402f', textAlign: 'right', fontWeight: '700' },
  warning: { backgroundColor: '#fbf2df', padding: 14, borderRadius: 14 },
  warningText: { color: '#6d5729', textAlign: 'right', lineHeight: 22 },
  agreementBox: { gap: 10, borderWidth: 1, borderColor: '#d8d5cd', borderRadius: 14, padding: 14, backgroundColor: '#fffefa' },
  checkRow: { borderWidth: 1, borderColor: '#d8d5cd', borderRadius: 12, padding: 12, backgroundColor: '#ffffff' },
  checkRowActive: { borderColor: '#20211f', backgroundColor: '#f2f0ea' },
  checkText: { color: '#44453f', textAlign: 'right', lineHeight: 22 },
  link: { textAlign: 'center', textDecorationLine: 'underline', color: '#30362d', fontWeight: '700', paddingVertical: 5 },
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 12, padding: 12, lineHeight: 22 },
  disabled: { opacity: 0.35 },
});
