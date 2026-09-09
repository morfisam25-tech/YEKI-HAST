import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getEmailAuthErrorCode, requestEmailOtp, verifyEmailOtp } from './email-auth-api';
import type { SessionResponse } from './api';
import { mobileRadius, mobileTheme } from './theme';

type Props = {
  onAuthenticated: (session: SessionResponse) => Promise<void> | void;
  onBack: () => void;
};

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    invalid_email: 'ایمیل را درست وارد کن.',
    invalid_otp: 'کد واردشده درست نیست یا منقضی شده.',
    otp_request_rate_limited: 'تعداد درخواست کد زیاد شده. کمی بعد دوباره امتحان کن.',
    email_auth_not_configured: 'ورود ایمیلی در این محیط هنوز فعال نشده.',
    email_delivery_unavailable: 'ارسال ایمیل موقتاً در دسترس نیست.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره امتحان کن.';
}

export default function EmailAuthScreen({ onAuthenticated, onBack }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestEmailOtp(email.trim());
      setCodeSent(true);
    } catch (cause) {
      setError(messageFor(getEmailAuthErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const session = await verifyEmailOtp(email.trim(), code.trim());
      await onAuthenticated(session);
    } catch (cause) {
      setError(messageFor(getEmailAuthErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>ورود امن</Text>
      <Text style={styles.title}>ورود با ایمیل</Text>
      <Text style={styles.body}>
        یک کد یک‌بارمصرف به ایمیلت می‌فرستیم. برای ورود رمز عبور یا شماره تلفن لازم نیست.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!busy && !codeSent}
        placeholder="name@example.com"
        placeholderTextColor="#9A8F85"
        style={styles.input}
      />
      {!codeSent ? (
        <TouchableOpacity disabled={busy || email.trim().length < 3} style={[styles.primary, (busy || email.trim().length < 3) && styles.disabled]} onPress={sendCode}>
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
            placeholderTextColor="#9A8F85"
            maxLength={6}
            editable={!busy}
            style={styles.input}
          />
          <TouchableOpacity disabled={busy || code.length !== 6} style={[styles.primary, (busy || code.length !== 6) && styles.disabled]} onPress={verifyCode}>
            <Text style={styles.primaryText}>{busy ? 'در حال بررسی…' : 'تأیید و ورود'}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => { setCodeSent(false); setCode(''); setError(''); }}>
            <Text style={styles.link}>تغییر ایمیل</Text>
          </TouchableOpacity>
        </>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity disabled={busy} onPress={onBack}><Text style={styles.link}>برگشت</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: mobileTheme.paper, borderRadius: mobileRadius.large, padding: 22, gap: 13 },
  eyebrow: { color: '#9E572E', fontSize: 12, fontWeight: '900', textAlign: 'right' },
  title: { color: mobileTheme.ink, fontSize: 24, fontWeight: '900', textAlign: 'right', letterSpacing: -0.5 },
  body: { color: mobileTheme.mutedInk, fontSize: 14, lineHeight: 23, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: mobileTheme.lineLight, backgroundColor: mobileTheme.field, color: mobileTheme.ink, borderRadius: mobileRadius.medium, padding: 13, textAlign: 'left' },
  primary: { backgroundColor: mobileTheme.inkStrong, borderRadius: mobileRadius.small, padding: 14 },
  primaryText: { color: '#FFF', textAlign: 'center', fontWeight: '800' },
  link: { color: '#6F5E54', textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 7 },
  error: { color: mobileTheme.danger, backgroundColor: mobileTheme.dangerSurface, borderRadius: mobileRadius.medium, padding: 11, textAlign: 'right', lineHeight: 21 },
  disabled: { opacity: 0.4 },
});
