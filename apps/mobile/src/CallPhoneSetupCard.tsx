import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  getCallPhoneErrorCode,
  getCallPhoneStatus,
  submitCallPhone,
  type CallPhoneStatus,
} from './call-phone-api';

type Props = {
  token: string;
  onVerifiedChange?: (verified: boolean) => void;
};

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    invalid_phone: 'شماره موبایل را درست وارد کن.',
    phone_already_registered: 'این شماره قبلاً برای حساب دیگری ثبت شده است.',
    sensitive_data_not_configured: 'ثبت امن شماره در این محیط هنوز آماده نیست.',
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'ثبت شماره انجام نشد. دوباره امتحان کن.';
}

export default function CallPhoneSetupCard({ token, onVerifiedChange }: Props) {
  const [status, setStatus] = useState<CallPhoneStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setBusy(true);
    try {
      const value = await getCallPhoneStatus(token);
      setStatus(value);
      onVerifiedChange?.(value.verified);
      setError('');
    } catch (cause) {
      setError(messageFor(getCallPhoneErrorCode(cause)));
      onVerifiedChange?.(false);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const value = await submitCallPhone(token, phone);
      const next = { configured: value.configured, verified: value.verified };
      setStatus(next);
      onVerifiedChange?.(next.verified);
      setEditing(false);
      setPhone('');
    } catch (cause) {
      setError(messageFor(getCallPhoneErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  const showForm = editing || status?.configured === false;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>شماره تماس امن</Text>
      {status === null && <Text style={styles.body}>{busy ? 'در حال بررسی شماره…' : 'وضعیت شماره مشخص نیست.'}</Text>}
      {status?.verified && (
        <>
          <Text style={styles.ok}>✓ شماره تماس برای تماس واقعی تأیید شده است.</Text>
          <TouchableOpacity disabled={busy} onPress={() => setEditing(true)}>
            <Text style={styles.link}>تغییر شماره</Text>
          </TouchableOpacity>
        </>
      )}
      {status?.configured && !status.verified && !editing && (
        <>
          <Text style={styles.body}>
            شماره ثبت شده ولی هنوز تأیید نشده است. در بتای بسته، ادمین بعد از بررسی مالکیت شماره آن را فعال می‌کند.
          </Text>
          <TouchableOpacity disabled={busy} style={styles.secondary} onPress={() => { void refresh(); }}>
            <Text style={styles.secondaryText}>{busy ? 'در حال بررسی…' : 'بررسی دوباره وضعیت'}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => setEditing(true)}>
            <Text style={styles.link}>تغییر شماره</Text>
          </TouchableOpacity>
        </>
      )}
      {showForm && (
        <>
          <Text style={styles.body}>
            این شماره فقط برای برقراری تماس استفاده می‌شود و به طرف مقابل نمایش داده نمی‌شود.
          </Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="0912..."
            editable={!busy}
            style={styles.input}
            textAlign="right"
          />
          <TouchableOpacity disabled={busy || phone.trim().length < 8} style={styles.primary} onPress={save}>
            <Text style={styles.primaryText}>{busy ? 'در حال ثبت…' : 'ثبت شماره'}</Text>
          </TouchableOpacity>
          {editing && status?.configured && (
            <TouchableOpacity disabled={busy} onPress={() => { setEditing(false); setPhone(''); setError(''); }}>
              <Text style={styles.link}>انصراف</Text>
            </TouchableOpacity>
          )}
        </>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#E7E2DA', borderRadius: 18, padding: 18, gap: 12 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  ok: { fontSize: 14, lineHeight: 22, textAlign: 'right', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#D9D2C8', borderRadius: 12, padding: 13, fontSize: 16 },
  primary: { backgroundColor: '#171717', borderRadius: 12, padding: 14 },
  primaryText: { color: '#FFF', textAlign: 'center', fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: '#171717', borderRadius: 12, padding: 12 },
  secondaryText: { textAlign: 'center', fontWeight: '700' },
  link: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 6 },
  error: { color: '#9E2525', textAlign: 'right', lineHeight: 21 },
});
