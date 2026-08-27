import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  browseListeners,
  cancelCall,
  confirmCallerAge,
  dispatchCall,
  getCall,
  getErrorCode,
  requestCall,
  safetyExitCall,
  type BrowseListener,
  type CallResponse,
} from './api';

type Props = {
  token: string;
  onClose: () => void;
};

type Stage = 'age-gate' | 'browse' | 'call';

const terminalStatuses = new Set(['completed', 'missed', 'failed', 'cancelled', 'safety_terminated']);

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    caller_closed_beta_disabled: 'بتای Caller برای این محیط بسته شده است.',
    caller_age_policy_not_configured: 'سیاست سنی Caller هنوز برای این محیط فعال نشده.',
    caller_age_gate_required: 'برای ادامه باید شرط سنی نسخه جاری را تأیید کنی.',
    no_listener_available: 'فعلاً شنونده آماده‌ای پیدا نشد.',
    insufficient_balance: 'موجودی کیف پول برای شروع تماس کافی نیست.',
    telephony_not_configured: 'تماس واقعی هنوز برای این محیط فعال نشده.',
    call_not_live: 'این تماس دیگر فعال نیست.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد.';
}

export default function CallerClosedBetaScreen({ token, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('age-gate');
  const [minimumAge, setMinimumAge] = useState<number | null>(null);
  const [listeners, setListeners] = useState<BrowseListener[]>([]);
  const [selected, setSelected] = useState<BrowseListener | null>(null);
  const [call, setCall] = useState<CallResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function acceptAgeGate() {
    setBusy(true);
    setError('');
    try {
      const result = await confirmCallerAge(token);
      setMinimumAge(result.minimumAge);
      const browse = await browseListeners(token, { limit: 20 });
      setListeners(browse.listeners);
      setStage('browse');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function refreshListeners() {
    setBusy(true);
    setError('');
    try {
      const result = await browseListeners(token, { limit: 20 });
      setListeners(result.listeners);
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function startCall(listener: BrowseListener) {
    const languageCode = listener.languages[0]?.code;
    if (!languageCode) {
      setError('برای این شنونده زبان فعالی ثبت نشده.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const requested = await requestCall(token, {
        clientRequestId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        listenerId: listener.id,
        languageCode,
        mood: 'just_talk',
      });

      setSelected(listener);
      setCall(requested);
      setStage('call');

      try {
        const dispatched = await dispatchCall(token, requested.callId);
        setCall(dispatched);
      } catch (cause) {
        setError(messageFor(getErrorCode(cause)));
      }
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function retryDispatch() {
    if (!call || call.status !== 'routing') return;
    setBusy(true);
    setError('');
    try {
      setCall(await dispatchCall(token, call.callId));
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function refreshCall() {
    if (!call) return;
    setBusy(true);
    setError('');
    try {
      const next = await getCall(token, call.callId);
      setCall(next);
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!call || terminalStatuses.has(call.status)) return;
    setBusy(true);
    setError('');
    try {
      setCall(await cancelCall(token, call.callId));
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function safetyExit() {
    if (!call || terminalStatuses.has(call.status)) return;
    setBusy(true);
    setError('');
    try {
      const result = await safetyExitCall(token, call.callId);
      setCall((current) => current ? { ...current, status: result.status } : current);
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Caller · بتای بسته</Text>
      <Text style={styles.note}>دسترسی این صفحه با وضعیت فعلی سرور کنترل می‌شود و هیچ مسیر تماس بدون age-gate باز نمی‌شود.</Text>

      {stage === 'age-gate' && (
        <View style={styles.card}>
          <Text style={styles.heading}>تأیید شرط سنی</Text>
          <Text style={styles.body}>قبل از دیدن مسیر تماس باید شرط سنی نسخه جاری سرور را تأیید کنی. مقدار سن از داخل اپ حدس زده نمی‌شود.</Text>
          <TouchableOpacity disabled={busy} style={styles.primary} onPress={acceptAgeGate}>
            <Text style={styles.primaryText}>{busy ? 'در حال بررسی…' : 'تأیید و ادامه'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'browse' && (
        <View style={styles.card}>
          <Text style={styles.heading}>شنونده‌های آماده</Text>
          {minimumAge !== null && <Text style={styles.meta}>سیاست جاری: حداقل {minimumAge} سال</Text>}
          {listeners.length === 0 && <Text style={styles.body}>فعلاً شنونده Online نمایش داده نشد.</Text>}
          {listeners.map((listener) => (
            <View key={listener.id} style={styles.listener}>
              <View style={styles.listenerText}>
                <Text style={styles.listenerName}>{listener.nickname}</Text>
                <Text style={styles.meta}>{listener.languages.map((x) => x.nameFa).join(' · ') || 'زبان ثبت نشده'}</Text>
                {!!listener.shortIntro && <Text style={styles.body}>{listener.shortIntro}</Text>}
              </View>
              <TouchableOpacity disabled={busy} style={styles.smallButton} onPress={() => startCall(listener)}>
                <Text style={styles.smallButtonText}>تماس</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity disabled={busy} onPress={refreshListeners}><Text style={styles.link}>به‌روزرسانی فهرست</Text></TouchableOpacity>
        </View>
      )}

      {stage === 'call' && call && (
        <View style={styles.card}>
          <Text style={styles.heading}>{selected?.nickname ?? 'تماس'}</Text>
          <Text style={styles.status}>وضعیت: {call.status}</Text>
          {call.status === 'routing' && (
            <TouchableOpacity disabled={busy} style={styles.primary} onPress={retryDispatch}>
              <Text style={styles.primaryText}>{busy ? 'در حال تلاش…' : 'ادامه همین تماس'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity disabled={busy} onPress={refreshCall}><Text style={styles.link}>به‌روزرسانی وضعیت</Text></TouchableOpacity>
          {!terminalStatuses.has(call.status) && (
            <>
              <TouchableOpacity disabled={busy} style={styles.secondary} onPress={cancel}>
                <Text style={styles.secondaryText}>لغو تماس</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy} style={styles.safety} onPress={safetyExit}>
                <Text style={styles.safetyText}>پایان فوری برای ایمنی</Text>
              </TouchableOpacity>
            </>
          )}
          {terminalStatuses.has(call.status) && (
            <TouchableOpacity onPress={() => { setCall(null); setSelected(null); setStage('browse'); }}>
              <Text style={styles.link}>برگشت به شنونده‌ها</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity onPress={onClose}><Text style={styles.close}>بستن</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'right' },
  note: { fontSize: 13, lineHeight: 20, textAlign: 'right', opacity: 0.65 },
  card: { borderWidth: 1, borderColor: '#E7E2DA', borderRadius: 18, padding: 18, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  meta: { fontSize: 12, textAlign: 'right', opacity: 0.62 },
  primary: { backgroundColor: '#171717', borderRadius: 12, padding: 14 },
  primaryText: { color: '#FFF', textAlign: 'center', fontWeight: '700' },
  listener: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#EEE9E2', paddingTop: 12 },
  listenerText: { flex: 1, gap: 4 },
  listenerName: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
  smallButton: { borderWidth: 1, borderColor: '#171717', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  smallButtonText: { fontWeight: '700' },
  status: { textAlign: 'right', fontWeight: '600' },
  link: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 8 },
  secondary: { borderWidth: 1, borderColor: '#171717', borderRadius: 12, padding: 12 },
  secondaryText: { textAlign: 'center', fontWeight: '700' },
  safety: { borderWidth: 1, borderColor: '#9E2525', borderRadius: 12, padding: 12 },
  safetyText: { color: '#9E2525', textAlign: 'center', fontWeight: '700' },
  error: { color: '#9E2525', textAlign: 'right', lineHeight: 21 },
  close: { textAlign: 'center', opacity: 0.65, padding: 8 },
});