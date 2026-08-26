import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getErrorCode,
  getListenerPresence,
  heartbeatListenerPresence,
  setListenerPresence,
  type ListenerPresenceResponse,
} from './api';

type Props = { token: string; onDone: () => void };

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    listener_not_approved: 'حساب شنونده هنوز برای کار فعال نشده.',
    listener_verification_required: 'احراز هویت شنونده هنوز کامل نشده.',
    no_callers_accepted: 'برای Online شدن حداقل یک گروه Caller را فعال کن.',
    listener_not_online: 'وضعیت آنلاین منقضی شده؛ دوباره Online شو.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

export default function ListenerWorkScreen({ token, onDone }: Props) {
  const [presence, setPresence] = useState<ListenerPresenceResponse | null>(null);
  const [acceptsMale, setAcceptsMale] = useState(true);
  const [acceptsFemale, setAcceptsFemale] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const value = await getListenerPresence(token);
    setPresence(value);
    setAcceptsMale(value.acceptsMale);
    setAcceptsFemale(value.acceptsFemale);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(messageFor(getErrorCode(cause))));
  }, [token]);

  useEffect(() => {
    if (!presence || (presence.status !== 'online' && presence.status !== 'paused')) return;
    const timer = setInterval(() => {
      heartbeatListenerPresence(token).catch(async (cause) => {
        const code = getErrorCode(cause);
        setError(messageFor(code));
        if (code === 'listener_not_online') {
          try { await refresh(); } catch {}
        }
      });
    }, 30_000);
    return () => clearInterval(timer);
  }, [token, presence?.status]);

  async function changeStatus(status: 'online' | 'offline' | 'paused') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await setListenerPresence(token, status, acceptsMale, acceptsFemale);
      await refresh();
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  if (!presence) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>حالت کاری</Text>
        <Text style={styles.body}>{error || 'در حال بارگذاری…'}</Text>
      </View>
    );
  }

  const isOnline = presence.status === 'online';
  const isPaused = presence.status === 'paused';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>حالت کاری شنونده</Text>
      <View style={[styles.statusBox, isOnline && styles.onlineBox, isPaused && styles.pausedBox]}>
        <Text style={styles.statusText}>
          {isOnline ? '● آنلاین — آماده دریافت تماس' : isPaused ? '● مکث — تماس جدید نمی‌آید' : '○ آفلاین'}
        </Text>
      </View>

      <Text style={styles.helper}>تا وقتی Online یا Pause هستی، اپ هر ۳۰ ثانیه حضور تو را تأیید می‌کند. اگر ارتباط قطع شود، سرور بعد از ۹۰ ثانیه تو را برای Matching آفلاین حساب می‌کند.</Text>

      <Text style={styles.label}>Callerهایی که می‌پذیری</Text>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => setAcceptsFemale((value) => !value)}
          style={[styles.choice, acceptsFemale && styles.choiceSelected]}
        >
          <Text style={styles.choiceText}>زن {acceptsFemale ? '✓' : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setAcceptsMale((value) => !value)}
          style={[styles.choice, acceptsMale && styles.choiceSelected]}
        >
          <Text style={styles.choiceText}>مرد {acceptsMale ? '✓' : ''}</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {!isOnline && (
        <TouchableOpacity disabled={busy || (!acceptsMale && !acceptsFemale)} onPress={() => changeStatus('online')} style={[styles.primaryButton, (busy || (!acceptsMale && !acceptsFemale)) && styles.disabled]}>
          <Text style={styles.primaryText}>{busy ? 'در حال ثبت…' : 'Online — آماده‌ام'}</Text>
        </TouchableOpacity>
      )}
      {isOnline && (
        <TouchableOpacity disabled={busy} onPress={() => changeStatus('paused')} style={styles.pauseButton}>
          <Text style={styles.pauseText}>Pause</Text>
        </TouchableOpacity>
      )}
      {(isOnline || isPaused) && (
        <TouchableOpacity disabled={busy} onPress={() => changeStatus('offline')} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Offline و پایان شیفت</Text>
        </TouchableOpacity>
      )}
      {isPaused && (
        <TouchableOpacity disabled={busy || (!acceptsMale && !acceptsFemale)} onPress={() => changeStatus('online')} style={styles.primaryButton}>
          <Text style={styles.primaryText}>ادامه کار</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onDone} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>برگشت به خانه</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', padding: 22, borderRadius: 22, gap: 14 },
  title: { color: '#20211f', textAlign: 'right', fontSize: 24, fontWeight: '800', lineHeight: 34 },
  body: { color: '#66665f', textAlign: 'right', fontSize: 15, lineHeight: 25 },
  helper: { color: '#7a7972', textAlign: 'right', fontSize: 13, lineHeight: 22 },
  label: { color: '#20211f', textAlign: 'right', fontWeight: '700' },
  statusBox: { backgroundColor: '#f2f1ed', padding: 15, borderRadius: 14 },
  onlineBox: { backgroundColor: '#eaf2e6' },
  pausedBox: { backgroundColor: '#fbf2df' },
  statusText: { color: '#30312d', textAlign: 'right', fontWeight: '800' },
  row: { flexDirection: 'row-reverse', gap: 10 },
  choice: { borderWidth: 1, borderColor: '#d8d5cd', paddingVertical: 11, paddingHorizontal: 18, borderRadius: 999 },
  choiceSelected: { backgroundColor: '#e8ece4', borderColor: '#798272' },
  choiceText: { color: '#3f403b', fontWeight: '700' },
  primaryButton: { backgroundColor: '#20211f', paddingVertical: 15, paddingHorizontal: 18, borderRadius: 14 },
  primaryText: { color: '#ffffff', textAlign: 'center', fontWeight: '800' },
  pauseButton: { backgroundColor: '#f2e4bf', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14 },
  pauseText: { color: '#5a481d', textAlign: 'center', fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: '#d8d5cd', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14 },
  secondaryText: { color: '#44453f', textAlign: 'center', fontWeight: '700' },
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 12, padding: 12, lineHeight: 22 },
  disabled: { opacity: 0.35 },
});
