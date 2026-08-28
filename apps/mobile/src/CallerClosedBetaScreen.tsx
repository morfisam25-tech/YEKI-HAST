import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  browseListeners,
  cancelCall,
  confirmCallerAge,
  dispatchCall,
  getActiveCall,
  getCall,
  getErrorCode,
  requestCall,
  safetyExitCall,
  type BrowseListener,
  type CallResponse,
} from './api';
import CallPhoneSetupCard from './CallPhoneSetupCard';
import CallerWalletCard from './CallerWalletCard';
import CallerRecentCallsCard from './CallerRecentCallsCard';

type Props = {
  token: string;
  onClose: () => void;
};

type Stage = 'age-gate' | 'browse' | 'call';
type CallerCallResponse = CallResponse & { telephonyReady?: boolean };

const terminalStatuses = new Set(['completed', 'missed', 'failed', 'cancelled', 'safety_terminated']);
const cancellableStatuses = new Set(['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener']);
const telephonyIdentityStatuses = new Set(['calling_caller', 'caller_answered', 'calling_listener', 'connected']);
const terminationLockCodes = new Set([
  'telephony_termination_pending',
  'telephony_termination_reconcile_required',
  'call_termination_in_progress',
]);
const CALL_STATUS_POLL_MS = 3_000;

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    caller_closed_beta_disabled: 'بتای Caller برای این محیط بسته شده است.',
    caller_age_policy_not_configured: 'سیاست سنی Caller هنوز برای این محیط فعال نشده.',
    caller_age_gate_required: 'برای ادامه باید شرط سنی نسخه جاری را تأیید کنی.',
    caller_call_already_active: 'یک تماس فعال از قبل وجود دارد؛ همان تماس بازیابی می‌شود.',
    caller_active_call_conflict: 'چند تماس فعال همزمان پیدا شد. برای جلوگیری از انتخاب اشتباه، ادامه متوقف شده و نیاز به بررسی دارد.',
    no_listener_available: 'این شنونده دیگر آماده نیست؛ فهرست آماده‌ها به‌روزرسانی شد.',
    insufficient_balance: 'موجودی کیف پول برای شروع تماس کافی نیست.',
    telephony_not_configured: 'تماس واقعی هنوز برای این محیط فعال نشده.',
    telephony_dispatch_uncertain: 'نتیجه شروع تماس قطعی نشد. تماس جدید نساز و شروع را دوباره ارسال نکن؛ وضعیت همین تماس با «به‌روزرسانی وضعیت» بررسی می‌شود.',
    telephony_termination_reconcile_required: 'نتیجه قطع تماس هنوز نیاز به تطبیق دارد. پایان تماس را دوباره ارسال نکن؛ فقط وضعیت همین تماس باید بررسی شود.',
    call_termination_in_progress: 'پایان تماس از مسیر دیگری قبلاً شروع شده است؛ عملیات پایان دیگری را شروع نکن و وضعیت همین تماس را بررسی کن.',
    call_telephony_invariant: 'وضعیت مخابراتی این تماس با وضعیت سرور هم‌خوان نیست و نیاز به بررسی دارد.',
    call_counterparty_invalid: 'اطلاعات طرف مقابل این تماس معتبر نیست و عملیات ایمنی متوقف شد.',
    call_not_live: 'این تماس دیگر فعال نیست.',
    call_cannot_be_cancelled: 'این تماس از مرحله لغو عادی عبور کرده است.',
    telephony_termination_pending: 'درخواست پایان تماس ثبت شد اما قطع سمت سرویس تماس هنوز قطعی نشده است.',
    safety_settlement_pending: 'تماس برای ایمنی متوقف شد اما تسویه هنوز در حال نهایی‌شدن است.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد.';
}

export default function CallerClosedBetaScreen({ token, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('age-gate');
  const [minimumAge, setMinimumAge] = useState<number | null>(null);
  const [listeners, setListeners] = useState<BrowseListener[]>([]);
  const [selected, setSelected] = useState<BrowseListener | null>(null);
  const [call, setCall] = useState<CallerCallResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [callPhoneVerified, setCallPhoneVerified] = useState(false);
  const [error, setError] = useState('');

  function lockTerminationLocally(code: string) {
    if (!terminationLockCodes.has(code)) return;
    setCall((current) => current ? { ...current, terminationInProgress: true } : current);
  }

  useEffect(() => {
    let disposed = false;
    async function recoverActiveCall() {
      try {
        const result = await getActiveCall(token);
        if (disposed) return;
        if (result.activeCall) {
          setCall(result.activeCall);
          setStage('call');
        }
      } catch (cause) {
        if (!disposed) {
          const code = getErrorCode(cause);
          if (code === 'caller_active_call_conflict') setRecoveryBlocked(true);
          setError(messageFor(code));
        }
      } finally {
        if (!disposed) setRecoveryComplete(true);
      }
    }
    void recoverActiveCall();
    return () => { disposed = true; };
  }, [token]);

  useEffect(() => {
    if (stage !== 'call' || !call || terminalStatuses.has(call.status)) return;
    let disposed = false;
    const callId = call.callId;

    async function syncLiveCall() {
      try {
        const next = await getCall(token, callId);
        if (!disposed) {
          setCall((current) => current?.callId === callId ? next : current);
        }
      } catch (cause) {
        if (!disposed && getErrorCode(cause) !== 'network_error') {
          setError(messageFor(getErrorCode(cause)));
        }
      }
    }

    const timer = setInterval(() => { void syncLiveCall(); }, CALL_STATUS_POLL_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [token, stage, call?.callId, call?.status]);

  async function acceptAgeGate() {
    if (recoveryBlocked || !callPhoneVerified) return;
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
    if (recoveryBlocked || !callPhoneVerified) return;
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
    if (recoveryBlocked || !callPhoneVerified) return;
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
      const code = getErrorCode(cause);
      if (code === 'caller_call_already_active') {
        try {
          const recovered = await getActiveCall(token);
          if (recovered.activeCall) {
            setSelected(null);
            setCall(recovered.activeCall);
            setStage('call');
            return;
          }
        } catch (recoveryCause) {
          const recoveryCode = getErrorCode(recoveryCause);
          if (recoveryCode === 'caller_active_call_conflict') setRecoveryBlocked(true);
          setError(messageFor(recoveryCode));
          return;
        }
      }
      if (code === 'no_listener_available') {
        setSelected(null);
        setListeners((current) => current.filter((item) => item.id !== listener.id));
        try {
          const browse = await browseListeners(token, { limit: 20 });
          setListeners(browse.listeners);
        } catch {
          // Keep the stale listener removed even if the refresh request itself fails.
        }
        setError(messageFor(code));
        return;
      }
      setError(messageFor(code));
    } finally {
      setBusy(false);
    }
  }

  async function retryDispatch() {
    if (!call || call.status !== 'routing' || call.terminationInProgress) return;
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
    if (!call || !cancellableStatuses.has(call.status) || call.terminationInProgress) return;
    setBusy(true);
    setError('');
    try {
      setCall(await cancelCall(token, call.callId));
    } catch (cause) {
      const code = getErrorCode(cause);
      lockTerminationLocally(code);
      setError(messageFor(code));
    } finally {
      setBusy(false);
    }
  }

  async function safetyExit() {
    if (!call || terminalStatuses.has(call.status) || call.terminationInProgress) return;
    setBusy(true);
    setError('');
    try {
      const result = await safetyExitCall(token, call.callId);
      setCall((current) => current ? { ...current, status: result.status } : current);
    } catch (cause) {
      const code = getErrorCode(cause);
      lockTerminationLocally(code);
      setError(messageFor(code));
    } finally {
      setBusy(false);
    }
  }

  const telephonyUnresolved = Boolean(
    call && telephonyIdentityStatuses.has(call.status) && call.telephonyReady === false,
  );
  const terminationInProgress = Boolean(call?.terminationInProgress);
  const dispatchRetryable = Boolean(call && call.status === 'routing' && !terminationInProgress);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Caller · بتای بسته</Text>
      <Text style={styles.note}>ورود حساب با ایمیل انجام می‌شود؛ شروع تماس جدید فقط بعد از تأیید جداگانه شماره تماس و age-gate باز می‌شود.</Text>

      {!recoveryComplete && (
        <View style={styles.card}>
          <Text style={styles.heading}>بررسی تماس جاری</Text>
          <Text style={styles.body}>اگر تماس فعالی داشته باشی، همان تماس از سرور بازیابی می‌شود.</Text>
        </View>
      )}

      {recoveryComplete && !recoveryBlocked && stage !== 'call' && (
        <CallPhoneSetupCard token={token} onVerifiedChange={setCallPhoneVerified} />
      )}

      {recoveryComplete && !recoveryBlocked && stage !== 'call' && callPhoneVerified && <CallerWalletCard token={token} />}

      {recoveryComplete && recoveryBlocked && (
        <View style={styles.card}>
          <Text style={styles.heading}>نیاز به بررسی تماس</Text>
          <Text style={styles.body}>چند تماس فعال همزمان در سرور ثبت شده است. برای انتخاب نکردن تماس اشتباه، شروع تماس جدید در این صفحه موقتاً بسته است.</Text>
        </View>
      )}

      {recoveryComplete && !recoveryBlocked && callPhoneVerified && stage === 'age-gate' && (
        <View style={styles.card}>
          <Text style={styles.heading}>تأیید شرط سنی</Text>
          <Text style={styles.body}>قبل از دیدن مسیر تماس باید شرط سنی نسخه جاری سرور را تأیید کنی. مقدار سن از داخل اپ حدس زده نمی‌شود.</Text>
          <TouchableOpacity disabled={busy} style={styles.primary} onPress={acceptAgeGate}>
            <Text style={styles.primaryText}>{busy ? 'در حال بررسی…' : 'تأیید و ادامه'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {recoveryComplete && !recoveryBlocked && callPhoneVerified && stage === 'browse' && (
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

      {recoveryComplete && stage === 'call' && call && (
        <View style={styles.card}>
          <Text style={styles.heading}>{selected?.nickname ?? 'تماس جاری'}</Text>
          <Text style={styles.status}>وضعیت: {call.status}</Text>
          {telephonyUnresolved && (
            <Text style={styles.body}>شناسه تماس مخابراتی هنوز در سرور قطعی نشده است. برای جلوگیری از تماس تکراری، شروع دوباره ارسال نمی‌شود؛ فقط وضعیت همین تماس بررسی می‌شود.</Text>
          )}
          {terminationInProgress && (
            <Text style={styles.body}>پایان این تماس قبلاً شروع شده است. برای جلوگیری از درخواست تکراری، کنترل‌های پایان قفل شده‌اند؛ فقط وضعیت همین تماس را به‌روزرسانی کن.</Text>
          )}
          {dispatchRetryable && (
            <TouchableOpacity disabled={busy} style={styles.primary} onPress={retryDispatch}>
              <Text style={styles.primaryText}>{busy ? 'در حال تلاش…' : 'ادامه همین تماس'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity disabled={busy} onPress={refreshCall}><Text style={styles.link}>به‌روزرسانی وضعیت</Text></TouchableOpacity>
          {!terminalStatuses.has(call.status) && !telephonyUnresolved && !terminationInProgress && (
            <>
              {cancellableStatuses.has(call.status) && (
                <TouchableOpacity disabled={busy} style={styles.secondary} onPress={cancel}>
                  <Text style={styles.secondaryText}>لغو تماس</Text>
                </TouchableOpacity>
              )}
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

      {recoveryComplete && <CallerRecentCallsCard token={token} />}

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