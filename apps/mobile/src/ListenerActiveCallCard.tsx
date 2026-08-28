import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View, type AppStateStatus } from 'react-native';
import {
  getErrorCode,
  getListenerActiveCall,
  safetyExitCall,
  type ListenerActiveCall,
} from './api';

type Props = { token: string };

function statusLabel(status: ListenerActiveCall['status']): string {
  const labels: Record<ListenerActiveCall['status'], string> = {
    requested: 'درخواست تماس ثبت شده',
    routing: 'در حال آماده‌سازی تماس',
    calling_caller: 'در حال تماس با Caller',
    caller_answered: 'Caller پاسخ داده؛ در حال اتصال به تو',
    calling_listener: 'تلفن تو در حال زنگ خوردن است',
    connected: 'تماس وصل است',
  };
  return labels[status];
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    listener_active_call_conflict: 'بیش از یک تماس فعال برای این حساب ثبت شده؛ کنترل تماس قفل شد تا اپراتور بررسی کند.',
    telephony_dispatch_uncertain: 'وضعیت شبکه تلفنی هنوز قطعی نیست؛ کنترل ایمنی فعلاً قفل است.',
    call_telephony_invariant: 'وضعیت تماس با شبکه تلفنی هم‌خوان نیست و نیاز به بررسی دارد.',
    call_not_live: 'این تماس دیگر فعال نیست.',
    safety_settlement_pending: 'توقف ایمن ثبت شد اما تسویه تماس هنوز در حال نهایی‌شدن است.',
    telephony_termination_pending: 'درخواست توقف ایمن ثبت شد اما نتیجه قطع شبکه تلفنی قطعی نیست؛ دوباره Safety Exit را ارسال نکن.',
    telephony_termination_reconcile_required: 'نتیجه قطع شبکه تلفنی نیاز به تطبیق عملیاتی دارد؛ Safety Exit را دوباره ارسال نکن.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'وضعیت تماس قابل دریافت نیست. دوباره امتحان کن.';
}

export default function ListenerActiveCallCard({ token }: Props) {
  const [activeCall, setActiveCall] = useState<ListenerActiveCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const refreshInFlight = useRef(false);

  async function refresh() {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const value = await getListenerActiveCall(token);
      setActiveCall(value.activeCall);
      setError('');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      refreshInFlight.current = false;
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    const timer = setInterval(() => {
      if (appStateRef.current === 'active') refresh().catch(() => undefined);
    }, 5_000);
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') refresh().catch(() => undefined);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [token]);

  async function exitSafely() {
    if (!activeCall || busy) return;
    setBusy(true);
    setError('');
    try {
      await safetyExitCall(token, activeCall.callId);
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      await refresh().catch(() => undefined);
      setBusy(false);
    }
  }

  const canSafetyExit = Boolean(
    activeCall?.telephonyReady
    && (activeCall.status === 'caller_answered'
      || activeCall.status === 'calling_listener'
      || activeCall.status === 'connected'),
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>تماس فعال</Text>
        <Text style={[styles.pill, activeCall && styles.livePill]}>{activeCall ? 'LIVE' : 'IDLE'}</Text>
      </View>

      {!activeCall && !error && (
        <Text style={styles.helper}>در حال حاضر تماسی به این حساب اختصاص داده نشده است.</Text>
      )}

      {activeCall && (
        <>
          <Text style={styles.status}>{statusLabel(activeCall.status)}</Text>
          <Text style={styles.helper}>پاسخ‌دادن به تماس از خود تماس تلفنی انجام می‌شود؛ این صفحه Accept/Reject ساختگی اضافه نمی‌کند.</Text>
          <View style={styles.facts}>
            <Text style={styles.fact}>شبکه تلفنی: {activeCall.telephonyReady ? 'آماده' : 'در حال آماده‌سازی'}</Text>
            <Text style={styles.fact}>حداکثر زمان مجاز: {activeCall.maxBillableSeconds ? `${activeCall.maxBillableSeconds.toLocaleString('fa-IR')} ثانیه` : '—'}</Text>
            <Text style={styles.fact}>ثانیه ثبت‌شده: {activeCall.billableSeconds.toLocaleString('fa-IR')}</Text>
          </View>

          {canSafetyExit && (
            <TouchableOpacity
              disabled={busy}
              onPress={() => Alert.alert(
                'پایان ایمن تماس',
                'این کار تماس را از مسیر Safety Exit متوقف می‌کند. ادامه می‌دهی؟',
                [
                  { text: 'نه', style: 'cancel' },
                  { text: 'پایان ایمن', style: 'destructive', onPress: () => { void exitSafely(); } },
                ],
              )}
              style={[styles.safetyButton, busy && styles.disabled]}
            >
              <Text style={styles.safetyText}>{busy ? 'در حال ثبت توقف…' : 'Safety Exit'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#ddd8ce', borderRadius: 16, padding: 16, gap: 10, backgroundColor: '#faf9f5' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#20211f', textAlign: 'right', fontSize: 18, fontWeight: '800' },
  pill: { color: '#6d6c66', backgroundColor: '#eceae4', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999, fontSize: 11, fontWeight: '800' },
  livePill: { color: '#315a36', backgroundColor: '#e3efe1' },
  status: { color: '#20211f', textAlign: 'right', fontWeight: '800', fontSize: 16, lineHeight: 25 },
  helper: { color: '#77756e', textAlign: 'right', fontSize: 13, lineHeight: 21 },
  facts: { gap: 5 },
  fact: { color: '#53534e', textAlign: 'right', fontSize: 13, lineHeight: 20 },
  safetyButton: { backgroundColor: '#8a3430', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 13 },
  safetyText: { color: '#ffffff', textAlign: 'center', fontWeight: '800' },
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 12, padding: 11, lineHeight: 21 },
  disabled: { opacity: 0.4 },
});
