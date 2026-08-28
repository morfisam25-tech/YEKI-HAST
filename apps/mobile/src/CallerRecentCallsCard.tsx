import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { blockCallCounterparty, getErrorCode, reportCallSafety } from './api';
import {
  getCallerHistoryErrorCode,
  getCallerRecentCalls,
  type CallerRecentCall,
} from './caller-history-api';

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

function statusLabel(status: CallerRecentCall['status']): string {
  const labels: Record<CallerRecentCall['status'], string> = {
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
    invalid_limit: 'تعداد تماس‌های درخواستی معتبر نیست.',
    call_not_found: 'این تماس دیگر در دسترس نیست.',
    not_call_participant: 'این اقدام برای این تماس مجاز نیست.',
    call_counterparty_missing: 'طرف مقابل این تماس قابل شناسایی نیست.',
    call_counterparty_invalid: 'طرف مقابل این تماس معتبر نیست.',
    sensitive_data_not_configured: 'ثبت گزارش خصوصی در این محیط هنوز آماده نیست.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره امتحان کن.';
}

export default function CallerRecentCallsCard({ token }: Props) {
  const [calls, setCalls] = useState<CallerRecentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCallId, setBusyCallId] = useState<string | null>(null);
  const [reportCallId, setReportCallId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const value = await getCallerRecentCalls(token, 10);
      setCalls(value.calls);
      setError('');
    } catch (cause) {
      setError(messageFor(getCallerHistoryErrorCode(cause)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  async function block(callId: string) {
    if (busyCallId) return;
    setBusyCallId(callId);
    setError('');
    setNotice('');
    try {
      await blockCallCounterparty(token, callId);
      setNotice('این شنونده برای تماس‌های بعدی مسدود شد.');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusyCallId(null);
    }
  }

  async function report(callId: string, category: string) {
    if (busyCallId) return;
    setBusyCallId(callId);
    setError('');
    setNotice('');
    try {
      await reportCallSafety(token, { callId, category });
      setReportCallId(null);
      setNotice('گزارش ثبت شد.');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusyCallId(null);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>تماس‌های اخیر</Text>
        <TouchableOpacity disabled={loading} onPress={() => { void refresh(); }}>
          <Text style={styles.refresh}>{loading ? 'در حال بررسی…' : 'به‌روزرسانی'}</Text>
        </TouchableOpacity>
      </View>

      {!loading && calls.length === 0 && (
        <Text style={styles.helper}>هنوز تماس پایان‌یافته‌ای برای نمایش وجود ندارد.</Text>
      )}

      {calls.map((item) => (
        <View key={item.callId} style={styles.item}>
          <View style={styles.header}>
            <Text style={styles.status}>{statusLabel(item.status)}</Text>
            <Text style={styles.meta}>{item.endedAt ? new Date(item.endedAt).toLocaleString('fa-IR') : 'زمان پایان ثبت نشده'}</Text>
          </View>
          <Text style={styles.fact}>مدت ثبت‌شده: {item.billableSeconds.toLocaleString('fa-IR')} ثانیه</Text>

          {item.counterpartyActionAvailable && (
            <View style={styles.actions}>
              <TouchableOpacity
                disabled={Boolean(busyCallId)}
                style={[styles.outlineButton, busyCallId === item.callId && styles.disabled]}
                onPress={() => setReportCallId((current) => current === item.callId ? null : item.callId)}
              >
                <Text style={styles.outlineText}>گزارش</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={Boolean(busyCallId)}
                style={[styles.blockButton, busyCallId === item.callId && styles.disabled]}
                onPress={() => Alert.alert(
                  'مسدودکردن شنونده',
                  'بعد از مسدودکردن، این دو حساب نباید دوباره برای تماس به هم متصل شوند. ادامه می‌دهی؟',
                  [
                    { text: 'نه', style: 'cancel' },
                    { text: 'مسدود کن', style: 'destructive', onPress: () => { void block(item.callId); } },
                  ],
                )}
              >
                <Text style={styles.blockText}>مسدودکردن</Text>
              </TouchableOpacity>
            </View>
          )}

          {reportCallId === item.callId && item.counterpartyActionAvailable && (
            <View style={styles.reportPanel}>
              <Text style={styles.helper}>دسته گزارش را انتخاب کن. هویت واقعی شنونده در این صفحه نمایش داده نمی‌شود.</Text>
              <View style={styles.categories}>
                {reportCategories.map((category) => (
                  <TouchableOpacity
                    key={category.code}
                    disabled={Boolean(busyCallId)}
                    style={styles.categoryButton}
                    onPress={() => Alert.alert(
                      'ثبت گزارش',
                      `گزارش «${category.label}» برای این تماس ثبت شود؟`,
                      [
                        { text: 'نه', style: 'cancel' },
                        { text: 'ثبت گزارش', onPress: () => { void report(item.callId, category.code); } },
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
  card: { borderWidth: 1, borderColor: '#E7E2DA', borderRadius: 18, padding: 18, gap: 12 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'right' },
  refresh: { fontSize: 12, textDecorationLine: 'underline', opacity: 0.7 },
  helper: { fontSize: 13, lineHeight: 21, textAlign: 'right', opacity: 0.65 },
  item: { borderTopWidth: 1, borderTopColor: '#EEE9E2', paddingTop: 12, gap: 8 },
  status: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  meta: { fontSize: 11, textAlign: 'left', opacity: 0.6, flexShrink: 1 },
  fact: { fontSize: 13, lineHeight: 20, textAlign: 'right', opacity: 0.75 },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  outlineButton: { borderWidth: 1, borderColor: '#171717', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, flex: 1 },
  outlineText: { textAlign: 'center', fontWeight: '700' },
  blockButton: { borderWidth: 1, borderColor: '#9E2525', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, flex: 1 },
  blockText: { color: '#9E2525', textAlign: 'center', fontWeight: '700' },
  reportPanel: { gap: 8, backgroundColor: '#F7F3ED', borderRadius: 12, padding: 10 },
  categories: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7 },
  categoryButton: { borderWidth: 1, borderColor: '#D8D0C5', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#FFF' },
  categoryText: { fontSize: 12 },
  notice: { textAlign: 'right', color: '#315A36', backgroundColor: '#EAF2E6', borderRadius: 12, padding: 11, lineHeight: 21 },
  error: { textAlign: 'right', color: '#9E2525', backgroundColor: '#F9ECEA', borderRadius: 12, padding: 11, lineHeight: 21 },
  disabled: { opacity: 0.4 },
});
