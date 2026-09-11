import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getSmsAuthErrorCode, requestSmsOtp, verifySmsOtp } from './sms-auth-api';
import type { SessionResponse } from './api';

type Props = {
  onAuthenticated: (session: SessionResponse) => Promise<void> | void;
  onBack: () => void;
};

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    invalid_phone: 'شماره موبایل ایران را درست وارد کن.',
    invalid_otp: 'کد واردشده درست نیست یا منقضی شده.',
    otp_request_rate_limited: 'هنوز زمان ارسال دوباره نرسیده یا تعداد درخواست‌ها زیاد شده. کمی بعد دوباره امتحان کن.',
    sms_delivery_unavailable: 'ارسال پیامک موقتاً در دسترس نیست.',
    account_deletion_pending: 'درخواست حذف این حساب در حال پردازش است.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره امتحان کن.';
}

export default function PhoneAuthScreen({ onAuthenticated, onBack }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  async function sendCode() {
    if (busy || resendSeconds > 0) return;
    setBusy(true);
    setError('');
    try {
      await requestSmsOtp(phone.trim());
      setCodeSent(true);
      setResendSeconds(60);
    } catch (cause) {
      setError(messageFor(getSmsAuthErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const session = await verifySmsOtp(phone.trim(), code.trim());
      await onAuthenticated(session);
    } catch (cause) {
      setError(messageFor(getSmsAuthErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>ورود با شماره موبایل</Text>
      <Text style={styles.body}>شماره موبایل ایران را وارد کن تا کد یک‌بارمصرف برایت پیامک شود.</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        editable={!busy && !codeSent}
        placeholder="09123456789"
        style={styles.input}
      />
      {!codeSent ? (
        <TouchableOpacity disabled={busy || phone.trim().length < 10} style={styles.primary} onPress={sendCode}>
          <Text style={styles.primaryText}>{busy ? 'در حال ارسال…' : 'ارسال کد ورود'}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            placeholder="کد ۶ رقمی"
            maxLength={6}
            editable={!busy}
            style={styles.input}
          />
          <TouchableOpacity disabled={busy || code.length !== 6} style={styles.primary} onPress={verifyCode}>
            <Text style={styles.primaryText}>{busy ? 'در حال بررسی…' : 'تأیید و ورود'}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy || resendSeconds > 0} onPress={sendCode}>
            <Text style={styles.link}>{resendSeconds > 0 ? `ارسال دوباره کد (${resendSeconds})` : 'ارسال دوباره کد'}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => { setCodeSent(false); setCode(''); setError(''); setResendSeconds(0); }}>
            <Text style={styles.link}>تغییر شماره موبایل</Text>
          </TouchableOpacity>
        </>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity disabled={busy} onPress={onBack}><Text style={styles.link}>برگشت</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#E7E2DA', borderRadius: 18, padding: 18, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: '#D9D2C8', borderRadius: 12, padding: 13, textAlign: 'left' },
  primary: { backgroundColor: '#171717', borderRadius: 12, padding: 14 },
  primaryText: { color: '#FFF', textAlign: 'center', fontWeight: '700' },
  link: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 7 },
  error: { color: '#9E2525', textAlign: 'right', lineHeight: 21 },
});
