import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  getErrorCode,
  getListenerKycStatus,
  submitListenerKyc,
  type ListenerKycStatusResponse,
} from './api';

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
    kyc_already_verified: 'احراز هویت قبلاً تأیید شده است.',
    kyc_pending_review: 'اطلاعات احراز هویت قبلاً ثبت شده و هنوز در حال بررسی است.',
    invalid_legal_name: 'نام و نام خانوادگی را مطابق مدرک هویتی وارد کن.',
    invalid_national_id: 'کد ملی معتبر نیست.',
    invalid_date_of_birth: 'تاریخ تولد شمسی معتبر نیست.',
    date_of_birth_mismatch: 'تاریخ تولد با اطلاعات قبلی همخوان نیست.',
    invalid_bank_iban: 'شماره شبا معتبر نیست.',
    national_id_already_registered: 'این کد ملی قبلاً برای حساب دیگری ثبت شده است.',
    kyc_identity_conflict: 'اطلاعات هویتی با حساب دیگری تداخل دارد.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

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
    return (
      <View style={styles.card}>
        <Text style={styles.title}>احراز هویت تأیید شد</Text>
        <Text style={styles.body}>اطلاعات واقعی تو خصوصی می‌ماند. مرحله بعدی قرارداد و بررسی نهایی است.</Text>
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
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 12, padding: 12, lineHeight: 22 },
  disabled: { opacity: 0.35 },
});
