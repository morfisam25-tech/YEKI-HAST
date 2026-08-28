import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View, type AppStateStatus } from 'react-native';
import {
  getErrorCode,
  getListenerPresence,
  heartbeatListenerPresence,
  setListenerPresence,
  type ListenerPresenceResponse,
} from './api';
import CallPhoneSetupCard from './CallPhoneSetupCard';
import ListenerActiveCallCard from './ListenerActiveCallCard';
import ListenerEarningsCard from './ListenerEarningsCard';

type Props = { token: string; onDone: () => void };
type PresenceStatus = 'online' | 'offline' | 'paused';

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    listener_not_approved: 'حساب شنونده هنوز برای کار فعال نشده.',
    listener_verification_required: 'احراز هویت شنونده هنوز کامل نشده.',
    verified_phone_required: 'برای دریافت تماس باید شماره تماس امن تأیید شده باشد.',
    no_callers_accepted: 'برای Online شدن حداقل یک گروه Caller را فعال کن.',
    listener_not_online: 'وضعیت آنلاین منقضی شده؛ دوباره Online شو.',
    listener_active_call_conflict: 'بیش از یک تماس فعال برای این حساب ثبت شده؛ کنترل‌های دریافت تماس تا بررسی وضعیت قفل‌اند.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

export default function ListenerWorkScreen({ token, onDone }: Props) {
  const [presence, setPresence] = useState<ListenerPresenceResponse | null>(null);
  const [acceptsMale, setAcceptsMale] = useState(true);
  const [acceptsFemale, setAcceptsFemale] = useState(true);
  const [activeCallConflict, setActiveCallConflict] = useState(false);
  const [callPhoneVerified, setCallPhoneVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const presenceRef = useRef<ListenerPresenceResponse | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  function applyPresence(value: ListenerPresenceResponse) {
    presenceRef.current = value;
    setPresence(value);
    setAcceptsMale(value.acceptsMale);
    setAcceptsFemale(value.acceptsFemale);
  }

  async function refresh() {
    const value = await getListenerPresence(token);
    applyPresence(value);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(messageFor(getErrorCode(cause))));
  }, [token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active') {
        refresh().catch((cause) => setError(messageFor(getErrorCode(cause))));
        return;
      }

      const current = presenceRef.current;
      if (previous === 'active' && current && (current.status === 'online' || current.status === 'paused')) {
        // Going offline must remain available even if another launch guard becomes false.
        setListenerPresence(token, 'offline', current.acceptsMale, current.acceptsFemale).catch(() => undefined);
        applyPresence({
          ...current,
          status: 'offline',
          onlineSince: null,
          lastHeartbeatAt: null,
        });
      }
    });

    return () => subscription.remove();
  }, [token]);

  useEffect(() => {
    if (!presence || (presence.status !== 'online' && presence.status !== 'paused')) return;
    if (appStateRef.current !== 'active') return;

    const timer = setInterval(() => {
      if (appStateRef.current !== 'active') return;
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

  async function changeStatus(status: PresenceStatus) {
    if (busy) return;
    if (activeCallConflict && status !== 'offline') {
      setError(messageFor('listener_active_call_conflict'));
      return;
    }
    if (!callPhoneVerified && status !== 'offline') {
      setError(messageFor('verified_phone_required'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await setListenerPresence(token, status, acceptsMale, acceptsFemale);
      applyPresence({
        status: result.status,
        acceptsMale: result.acceptsMale,
        acceptsFemale: result.acceptsFemale,
        onlineSince: status === 'online' ? presenceRef.current?.onlineSince ?? new Date().toISOString() : null,
        lastHeartbeatAt: status === 'offline' ? null : new Date().toISOString(),
      });
      await refresh();
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function updateCallerPreference(kind: 'male' | 'female') {
    if (!presence || busy) return;
    if (activeCallConflict) {
      setError(messageFor('listener_active_call_conflict'));
      return;
    }
    if (!callPhoneVerified) {
      setError(messageFor('verified_phone_required'));
      return;
    }
    const nextMale = kind === 'male' ? !acceptsMale : acceptsMale;
    const nextFemale = kind === 'female' ? !acceptsFemale : acceptsFemale;
    if (presence.status === 'online' && !nextMale && !nextFemale) {
      setError(messageFor('no_callers_accepted'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await setListenerPresence(token, presence.status, nextMale, nextFemale);
      setAcceptsMale(result.acceptsMale);
      setAcceptsFemale(result.acceptsFemale);
      presenceRef.current = {
        ...presence,
        status: result.status,
        acceptsMale: result.acceptsMale,
        acceptsFemale: result.acceptsFemale,
      };
      setPresence(presenceRef.current);
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function leaveWorkMode() {
    const current = presenceRef.current;
    if (current && (current.status === 'online' || current.status === 'paused')) {
      try {
        await setListenerPresence(token, 'offline', current.acceptsMale, current.acceptsFemale);
      } catch {}
    }
    onDone();
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
  const workControlsLocked = busy || activeCallConflict || !callPhoneVerified;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>حالت کاری شنونده</Text>
      <View style={[
        styles.statusBox,
        isOnline && styles.onlineBox,
        isPaused && styles.pausedBox,
        (activeCallConflict || !callPhoneVerified) && styles.conflictBox,
      ]}>
        <Text style={styles.statusText}>
          {activeCallConflict
            ? '⚠ چند تماس فعال ثبت شده — دریافت تماس جدید قفل است'
            : !callPhoneVerified
              ? '⚠ شماره تماس هنوز تأیید نشده — دریافت تماس جدید قفل است'
              : isOnline
                ? '● آنلاین — آماده دریافت تماس'
                : isPaused
                  ? '● مکث — تماس جدید نمی‌آید'
                  : '○ آفلاین'}
        </Text>
      </View>

      <Text style={styles.helper}>Heartbeat فقط وقتی اپ باز و وضعیت Online یا Pause باشد هر ۳۰ ثانیه ارسال می‌شود. با رفتن اپ به پس‌زمینه، حضور به‌صورت امن Offline می‌شود؛ guard سرور هم بعد از ۹۰ ثانیه stale presence را رد می‌کند.</Text>
      {activeCallConflict && (
        <Text style={styles.error}>سرور این حساب را به‌دلیل وجود چند تماس فعال از دریافت تماس جدید کنار می‌گذارد. Online، Pause و تغییر گروه Caller تا رفع تعارض قفل‌اند؛ Offline همچنان مجاز است.</Text>
      )}
      {!callPhoneVerified && (
        <Text style={styles.error}>تا وقتی مالکیت شماره تماس برای بتا تأیید نشده، Online، Pause و تغییر گروه Caller قفل‌اند. اگر از قبل Online باشی، Offline همچنان باز می‌ماند.</Text>
      )}

      <CallPhoneSetupCard token={token} onVerifiedChange={setCallPhoneVerified} />
      <ListenerActiveCallCard token={token} onActiveCallConflictChange={setActiveCallConflict} />
      <ListenerEarningsCard token={token} />

      <Text style={styles.label}>Callerهایی که می‌پذیری</Text>
      <View style={styles.row}>
        <TouchableOpacity
          disabled={workControlsLocked}
          onPress={() => updateCallerPreference('female')}
          style={[styles.choice, acceptsFemale && styles.choiceSelected, workControlsLocked && styles.disabled]}
        >
          <Text style={styles.choiceText}>زن {acceptsFemale ? '✓' : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={workControlsLocked}
          onPress={() => updateCallerPreference('male')}
          style={[styles.choice, acceptsMale && styles.choiceSelected, workControlsLocked && styles.disabled]}
        >
          <Text style={styles.choiceText}>مرد {acceptsMale ? '✓' : ''}</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {!isOnline && !isPaused && (
        <TouchableOpacity disabled={workControlsLocked || (!acceptsMale && !acceptsFemale)} onPress={() => changeStatus('online')} style={[styles.primaryButton, (workControlsLocked || (!acceptsMale && !acceptsFemale)) && styles.disabled]}>
          <Text style={styles.primaryText}>{busy ? 'در حال ثبت…' : 'Online — آماده‌ام'}</Text>
        </TouchableOpacity>
      )}
      {isOnline && (
        <TouchableOpacity disabled={workControlsLocked} onPress={() => changeStatus('paused')} style={[styles.pauseButton, workControlsLocked && styles.disabled]}>
          <Text style={styles.pauseText}>Pause</Text>
        </TouchableOpacity>
      )}
      {(isOnline || isPaused) && (
        <TouchableOpacity disabled={busy} onPress={() => changeStatus('offline')} style={[styles.secondaryButton, busy && styles.disabled]}>
          <Text style={styles.secondaryText}>Offline و پایان شیفت</Text>
        </TouchableOpacity>
      )}
      {isPaused && (
        <TouchableOpacity disabled={workControlsLocked || (!acceptsMale && !acceptsFemale)} onPress={() => changeStatus('online')} style={[styles.primaryButton, (workControlsLocked || (!acceptsMale && !acceptsFemale)) && styles.disabled]}>
          <Text style={styles.primaryText}>ادامه کار</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity disabled={busy} onPress={leaveWorkMode} style={[styles.secondaryButton, busy && styles.disabled]}>
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
  conflictBox: { backgroundColor: '#f9ecea' },
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