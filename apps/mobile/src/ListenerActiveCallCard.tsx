import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View, type AppStateStatus } from 'react-native';
import {
  blockCallCounterparty,
  getErrorCode,
  getListenerActiveCall,
  getListenerRecentCalls,
  reportCallSafety,
  safetyExitCall,
  type ListenerActiveCall,
  type ListenerRecentCall,
} from './api';

type Props = { token: string };

const reportCategories = [
  { code: 'sexual_behavior', label: 'رفتار جنسی نامناسب' },
  { code: 'harassment', label: 'مزاحمت' },
  { code: 'insult', label: 'توهین' },
  { code: 'threat', label: 'تهدید' },
  { code: 'off_platform_request', label: 'درخواست خارج از پلتفرم' },
  { code: 'privacy_violation', label: 'نقض حریم خصوصی' },
  { code: 'scam', label: 'کلاهبرداری' },
  { code: 'unsafe_advice', label: 'توصیه ناایمن' },
  { code: 'inappropriate_conduct', label: 'رفتار نامناسب' },
  { code: 'technical_problem', label: 'مشکل فنی' },
  { code: 'other', label: 'سایر' },
] as const;

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

function recentStatusLabel(status: ListenerRecentCall['status']): string {
  const labels: Record<ListenerRecentCall['status'], string> = {
    completed: 'پایان‌یافته',
    missed: 'بی‌پاسخ',
    cancelled: 'لغوشده',
    failed: 'ناموفق',
    safety_terminated: 'پایان ایمن',
  };
  return labels[status];
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    listener_active_call_conflict: 'بیش از یک تماس فعال برای این حساب ثبت شده؛ کنترل تماس قفل شد تا اپراتور بررسی کند.',
    telephony_dispatch_uncertain: 'وضعیت شبکه تلفنی هنوز قطعی نیست؛ کنترل ایمنی فعلاً قفل است.',
    call_telephony_invariant: 'وضعیت تماس با شبکه تلفنی هم‌خوان نیست و نیاز به بررسی دارد.',
    call_termination_in_progress: 'پایان تماس از مسیر دیگری قبلاً شروع شده است؛ Safety Exit را دوباره ارسال نکن و وضعیت همین تماس را بررسی کن.',
    call_not_live: 'این تماس دیگر فعال نیست.',
    call_not_found: 'این تماس دیگر در دسترس نیست.',
    not_call_participant: 'این اقدام برای این تماس مجاز نیست.',
    call_counterparty_missing: 'طرف مقابل این تماس قابل شناسایی نیست و اقدام ایمنی قفل شده است.',
    call_counterparty_invalid: 'طرف مقابل این تماس معتبر نیست و اقدام ایمنی قفل شده است.',
    sensitive_data_not_configured: 'ثبت گزارش خصوصی در این محیط هنوز آماده نیست.',
    safety_settlement_pending: 'توقف ایمن ثبت شد اما تسویه تماس هنوز در حال نهایی‌شدن است.',
    telephony_termination_pending: 'درخواست توقف ایمن ثبت شد اما نتیجه قطع شبکه تلفنی قطعی نیست؛ دوباره Safety Exit را ارسال نکن.',
    telephony_termination_reconcile_required: 'نتیجه قطع شبکه تلفنی نیاز به تطبیق عملیاتی دارد؛ Safety Exit را دوباره ارسال نکن.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره امتحان کن.';
}

export default function ListenerActiveCallCard({ token }: Props) {
  const [activeCall, setActiveCall] = useState<ListenerActiveCall | null>(null);
  const [recentCalls, setRecentCalls] = useState<ListenerRecentCall[]>([]);
  const [busy, setBusy] = useState(false);
  const [recentBusyId, setRecentBusyId] = useState<string | null>(null);
  const [reportCallId, setReportCallId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const refreshInFlight = useRef(false);
  const activeCallIdRef = useRef<string | null>(null);

  async function refreshRecent() {
    try {
      const value = await getListenerRecentCalls(token, 10);
      setRecentCalls(value.calls);
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    }
  }

  async function refresh() {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const value = await getListenerActiveCall(token);
      const previousCallId = activeCallIdRef.current;
      const nextCallId = value.activeCall?.callId ?? null;
      activeCallIdRef.current = nextCallId;
      setActiveCall(value.activeCall);
      setError('');
      if (previousCallId && !nextCallId) await refreshRecent();
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      refreshInFlight.current = false;
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    refreshRecent().catch(() => undefined);
    const timer = setInterval(() => {
      if (appStateRef.current === 'active') refresh().catch(() => undefined);
    }, 5_000);
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        refresh().catch(() => undefined);
        refreshRecent().catch(() => undefined);
      }
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
    setNotice('');
    try {
      await safetyExitCall(token, activeCall.callId);
      setNotice('توقف ایمن ثبت شد.');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      await refresh().catch(() => undefined);
      await refreshRecent().catch(() => undefined);
      setBusy(false);
    }
  }

  async function blockRecent(callId: string) {
    if (recentBusyId) return;
    setRecentBusyId(callId);
    setError('');
    setNotice('');
    try {
      await blockCallCounterparty(token, callId);
      setNotice('طرف مقابل این تماس مسدود شد.');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setRecentBusyId(null);
    }
  }

  async function reportRecent(callId: string, category: string) {
    if (recentBusyId) return;
    setRecentBusyId(callId);
    setError('');
    setNotice('');
    try {
      await reportCallSafety(token, { callId, category });
      setReportCallId(null);
      setNotice('گزارش ثبت شد.');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setRecentBusyId(null);
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

      <View style={styles.divider} />
      <View style={styles.header}>
        <Text style={styles.title}>تماس‌های اخیر</Text>
        <TouchableOpacity onPress={() => { void refreshRecent(); }}><Text style={styles.refresh}>به‌روزرسانی</Text></TouchableOpacity>
      </View>
      {!recentCalls.length && <Text style={styles.helper}>هنوز تماس پایان‌یافته‌ای برای نمایش وجود ندارد.</Text>}

      {recentCalls.map((item) => (
        <View key={item.callId} style={styles.recentItem}>
          <View style={styles.header}>
            <Text style={styles.status}>{recentStatusLabel(item.status)}</Text>
            <Text style={styles.meta}>{item.endedAt ? new Date(item.endedAt).toLocaleString('fa-IR') : 'زمان پایان ثبت نشده'}</Text>
          </View>
          <Text style={styles.fact}>مدت ثبت‌شده: {item.billableSeconds.toLocaleString('fa-IR')} ثانیه</Text>

          {item.counterpartyActionAvailable && (
            <View style={styles.recentActions}>
              <TouchableOpacity
                disabled={Boolean(recentBusyId)}
                style={[styles.outlineButton, recentBusyId === item.callId && styles.disabled]}
                onPress={() => setReportCallId((current) => current === item.callId ? null : item.callId)}
              >
                <Text style={styles.outlineText}>گزارش</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={Boolean(recentBusyId)}
                style={[styles.blockButton, recentBusyId === item.callId && styles.disabled]}
                onPress={() => Alert.alert(
                  'مسدودکردن طرف مقابل',
                  'بعد از مسدودکردن، این دو حساب نباید دوباره برای تماس به هم متصل شوند. ادامه می‌دهی؟',
                  [
                    { text: 'نه', style: 'cancel' },
                    { text: 'مسدود کن', style: 'destructive', onPress: () => { void blockRecent(item.callId); } },
                  ],
                )}
              >
                <Text style={styles.blockText}>مسدودکردن</Text>
              </TouchableOpacity>
            </View>
          )}

          {reportCallId === item.callId && item.counterpartyActionAvailable && (
            <View style={styles.reportPanel}>
              <Text style={styles.helper}>دسته گزارش را انتخاب کن. هویت طرف مقابل در این صفحه نمایش داده نمی‌شود.</Text>
              <View style={styles.categories}>
                {reportCategories.map((category) => (
                  <TouchableOpacity
                    key={category.code}
                    disabled={Boolean(recentBusyId)}
                    style={styles.categoryButton}
                    onPress={() => Alert.alert(
                      'ثبت گزارش',
                      `گزارش «${category.label}» برای این تماس ثبت شود؟`,
                      [
                        { text: 'نه', style: 'cancel' },
                        { text: 'ثبت گزارش', onPress: () => { void reportRecent(item.callId, category.code); } },
                      ],
                    )}
                  >
                    <Text style={styles.categoryText}>{category.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}

      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#ddd8ce', borderRadius: 16, padding: 16, gap: 10, backgroundColor: '#faf9f5' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: '#20211f', textAlign: 'right', fontSize: 18, fontWeight: '800' },
  pill: { color: '#6d6c66', backgroundColor: '#eceae4', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999, fontSize: 11, fontWeight: '800' },
  livePill: { color: '#315a36', backgroundColor: '#e3efe1' },
  status: { color: '#20211f', textAlign: 'right', fontWeight: '800', fontSize: 15, lineHeight: 23 },
  helper: { color: '#77756e', textAlign: 'right', fontSize: 13, lineHeight: 21 },
  facts: { gap: 5 },
  fact: { color: '#53534e', textAlign: 'right', fontSize: 13, lineHeight: 20 },
  meta: { color: '#77756e', textAlign: 'left', fontSize: 11, flexShrink: 1 },
  safetyButton: { backgroundColor: '#8a3430', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 13 },
  safetyText: { color: '#ffffff', textAlign: 'center', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#ddd8ce', marginVertical: 6 },
  refresh: { color: '#53534e', textDecorationLine: 'underline', fontSize: 12 },
  recentItem: { borderTopWidth: 1, borderTopColor: '#e8e3da', paddingTop: 12, gap: 8 },
  recentActions: { flexDirection: 'row-reverse', gap: 8 },
  outlineButton: { borderWidth: 1, borderColor: '#53534e', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, flex: 1 },
  outlineText: { color: '#3f403c', textAlign: 'center', fontWeight: '700' },
  blockButton: { borderWidth: 1, borderColor: '#8a3430', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, flex: 1 },
  blockText: { color: '#8a3430', textAlign: 'center', fontWeight: '700' },
  reportPanel: { gap: 8, backgroundColor: '#f2efe8', borderRadius: 12, padding: 10 },
  categories: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7 },
  categoryButton: { borderWidth: 1, borderColor: '#cfc8bb', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#faf9f5' },
  categoryText: { color: '#454640', fontSize: 12 },
  notice: { textAlign: 'right', color: '#315a36', backgroundColor: '#e3efe1', borderRadius: 12, padding: 11, lineHeight: 21 },
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 12, padding: 11, lineHeight: 21 },
  disabled: { opacity: 0.4 },
});
