import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View, type AppStateStatus } from 'react-native';
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
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
import {
  endInternetVoiceCall,
  getInternetVoiceConfig,
  getInternetVoiceErrorCode,
  getInternetVoiceSignals,
  heartbeatInternetVoiceCall,
  postInternetVoiceSignal,
  safetyExitInternetVoiceCall,
  type InternetVoiceSignal,
  type InternetVoiceTiming,
} from './internet-voice-api';

type Props = {
  token: string;
  onActiveCallConflictChange?: (conflicted: boolean) => void;
};

type ListenerVoiceCall = ListenerActiveCall & {
  transport?: 'internet_voice' | 'masked_pstn' | null;
  internetVoiceReady?: boolean;
};

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

const terminationLockCodes = new Set([
  'telephony_termination_pending',
  'telephony_termination_reconcile_required',
  'call_termination_in_progress',
]);
const ACTIVE_POLL_BASE_MS = 3_000;
const ACTIVE_POLL_JITTER_MS = 2_000;
const IDLE_POLL_BASE_MS = 20_000;
const IDLE_POLL_JITTER_MS = 10_000;
const SIGNAL_POLL_BASE_MS = 900;
const SIGNAL_POLL_JITTER_MS = 500;
const HEARTBEAT_BASE_MS = 4_500;
const HEARTBEAT_JITTER_MS = 1_500;

function voicePollDelayMs(base: number, jitter: number): number {
  return base + Math.floor(Math.random() * (jitter + 1));
}

function nextPollDelayMs(hasActiveCall: boolean): number {
  const base = hasActiveCall ? ACTIVE_POLL_BASE_MS : IDLE_POLL_BASE_MS;
  const jitter = hasActiveCall ? ACTIVE_POLL_JITTER_MS : IDLE_POLL_JITTER_MS;
  return base + Math.floor(Math.random() * (jitter + 1));
}

function statusLabel(status: ListenerActiveCall['status']): string {
  const labels: Record<ListenerActiveCall['status'], string> = {
    requested: 'درخواست تماس ثبت شده',
    routing: 'در حال آماده‌سازی تماس',
    calling_caller: 'در حال تماس با Caller',
    caller_answered: 'Caller پاسخ داده؛ در حال اتصال به تو',
    calling_listener: 'یک تماس اینترنتی منتظر پاسخ توست',
    connected: 'تماس اینترنتی وصل است',
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
    call_not_live: 'این تماس دیگر فعال نیست.',
    call_not_found: 'این تماس دیگر در دسترس نیست.',
    call_not_internet_voice: 'این تماس از مسیر Internet Voice نیست.',
    not_call_participant: 'این اقدام برای این تماس مجاز نیست.',
    call_counterparty_missing: 'طرف مقابل این تماس قابل شناسایی نیست و اقدام ایمنی قفل شده است.',
    call_counterparty_invalid: 'طرف مقابل این تماس معتبر نیست و اقدام ایمنی قفل شده است.',
    sensitive_data_not_configured: 'ثبت گزارش خصوصی در این محیط هنوز آماده نیست.',
    call_end_conflict: 'پایان تماس همزمان از مسیر دیگری ثبت شده؛ وضعیت تماس را به‌روزرسانی کن.',
    telephony_termination_pending: 'درخواست توقف ایمن ثبت شد اما نتیجه قطع fallback تلفنی قطعی نیست.',
    telephony_termination_reconcile_required: 'نتیجه قطع fallback تلفنی نیاز به تطبیق عملیاتی دارد.',
    call_termination_in_progress: 'پایان تماس از مسیر دیگری قبلاً شروع شده است.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره امتحان کن.';
}

function formatRemaining(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes.toLocaleString('fa-IR')}:${rest.toString().padStart(2, '0')}`;
}

export default function ListenerActiveCallCard({ token, onActiveCallConflictChange }: Props) {
  const [activeCall, setActiveCall] = useState<ListenerVoiceCall | null>(null);
  const [recentCalls, setRecentCalls] = useState<ListenerRecentCall[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [timing, setTiming] = useState<InternetVoiceTiming | null>(null);
  const [recentBusyId, setRecentBusyId] = useState<string | null>(null);
  const [reportCallId, setReportCallId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const refreshInFlight = useRef(false);
  const activeCallIdRef = useRef<string | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalIdsRef = useRef(new Set<string>());
  const postedMediaConnectedRef = useRef(false);

  function cleanupRtc() {
    const peer = peerRef.current;
    peerRef.current = null;
    try { peer?.close(); } catch {}
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    try { stream?.getTracks().forEach((track) => track.stop()); } catch {}
    processedSignalIdsRef.current.clear();
    postedMediaConnectedRef.current = false;
    setVoiceReady(false);
  }

  useEffect(() => () => {
    const peer = peerRef.current;
    peerRef.current = null;
    try { peer?.close(); } catch {}
    const stream = localStreamRef.current;
    localStreamRef.current = null;
    try { stream?.getTracks().forEach((track) => track.stop()); } catch {}
  }, []);

  async function refreshRecent() {
    try { setRecentCalls((await getListenerRecentCalls(token, 10)).calls); }
    catch (cause) { setError(messageFor(getErrorCode(cause))); }
  }

  async function refresh() {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const value = await getListenerActiveCall(token);
      const previousCallId = activeCallIdRef.current;
      const next = value.activeCall as ListenerVoiceCall | null;
      const nextCallId = next?.callId ?? null;
      activeCallIdRef.current = nextCallId;
      setActiveCall(next);
      onActiveCallConflictChange?.(false);
      setError('');
      if (previousCallId && !nextCallId) {
        cleanupRtc();
        setTiming(null);
        await refreshRecent();
      }
    } catch (cause) {
      const code = getErrorCode(cause);
      if (code === 'listener_active_call_conflict') {
        activeCallIdRef.current = null;
        setActiveCall(null);
        cleanupRtc();
        onActiveCallConflictChange?.(true);
      }
      setError(messageFor(code));
    } finally { refreshInFlight.current = false; }
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
    const scheduleNext = () => {
      clearTimer();
      if (cancelled || appStateRef.current !== 'active') return;
      timer = setTimeout(() => { timer = null; void pollAndReschedule(); }, nextPollDelayMs(Boolean(activeCallIdRef.current)));
    };
    const pollAndReschedule = async () => {
      if (cancelled || appStateRef.current !== 'active') return;
      await refresh().catch(() => undefined);
      scheduleNext();
    };
    void (async () => { await refresh().catch(() => undefined); await refreshRecent().catch(() => undefined); scheduleNext(); })();
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      clearTimer();
      if (nextState === 'active') void (async () => { await refresh().catch(() => undefined); await refreshRecent().catch(() => undefined); scheduleNext(); })();
    });
    return () => { cancelled = true; clearTimer(); subscription.remove(); };
  }, [token]);

  async function ensureMicrophone(): Promise<MediaStream> {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }

  async function postMediaConnected(callId: string) {
    if (postedMediaConnectedRef.current) return;
    postedMediaConnectedRef.current = true;
    try {
      const result = await postInternetVoiceSignal(token, callId, 'media_connected');
      if (result.status === 'connected' || result.becameConnected) {
        setActiveCall((current) => current?.callId === callId ? { ...current, status: 'connected' } : current);
      }
    } catch (cause) {
      postedMediaConnectedRef.current = false;
      setError(messageFor(getInternetVoiceErrorCode(cause)));
    }
  }

  async function consumeCallerSignal(callId: string, signal: InternetVoiceSignal) {
    const peer = peerRef.current;
    if (!peer || signal.senderRole !== 'caller' || processedSignalIdsRef.current.has(signal.id)) return;
    if (signal.kind === 'offer') {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as never));
      processedSignalIdsRef.current.add(signal.id);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await postInternetVoiceSignal(token, callId, 'answer', { type: answer.type, sdp: answer.sdp });
      return;
    }
    if (signal.kind === 'ice') {
      if (!peer.remoteDescription) return;
      await peer.addIceCandidate(new RTCIceCandidate(signal.payload as never));
      processedSignalIdsRef.current.add(signal.id);
      return;
    }
    if (signal.kind === 'media_connected') processedSignalIdsRef.current.add(signal.id);
  }

  async function answerInternetCall() {
    if (!activeCall || activeCall.transport !== 'internet_voice' || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // Listener grants microphone access only after an explicit Accept action.
      const stream = await ensureMicrophone();
      const config = await getInternetVoiceConfig(token, activeCall.callId);
      if (config.role !== 'listener') throw new Error('invalid_voice_role');
      const peer = new RTCPeerConnection({ iceServers: config.client.iceServers });
      try { peerRef.current?.close(); } catch {}
      peerRef.current = peer;
      processedSignalIdsRef.current.clear();
      postedMediaConnectedRef.current = false;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        void postInternetVoiceSignal(token, activeCall.callId, 'ice', event.candidate.toJSON()).catch((cause) => setError(messageFor(getInternetVoiceErrorCode(cause))));
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') void postMediaConnected(activeCall.callId);
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') setVoiceReady(false);
      };

      const signals = await getInternetVoiceSignals(token, activeCall.callId);
      const offer = [...signals.signals].reverse().find((signal) => signal.senderRole === 'caller' && signal.kind === 'offer');
      if (!offer) throw new Error('voice_offer_not_ready');
      await consumeCallerSignal(activeCall.callId, offer);
      for (const signal of signals.signals) {
        if (signal.kind === 'ice' && signal.senderRole === 'caller') await consumeCallerSignal(activeCall.callId, signal);
      }
      setVoiceReady(true);
      setNotice('پاسخ تماس ثبت شد؛ اتصال صوتی در حال تکمیل است.');
    } catch (cause) {
      const code = getInternetVoiceErrorCode(cause);
      if (cause instanceof Error && cause.message === 'voice_offer_not_ready') setError('پیشنهاد صوتی Caller هنوز نرسیده است. چند لحظه دیگر دوباره «پاسخ تماس» را بزن.');
      else if (cause instanceof Error && cause.message === 'invalid_voice_role') setError('نقش این نشست برای پاسخ Listener معتبر نیست.');
      else setError(messageFor(code));
      cleanupRtc();
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!voiceReady || !activeCall || activeCall.transport !== 'internet_voice') return;
    let disposed = false;
    const callId = activeCall.callId;
    async function pollSignals() {
      try {
        const result = await getInternetVoiceSignals(token, callId);
        if (disposed) return;
        for (const signal of result.signals) {
          try { await consumeCallerSignal(callId, signal); }
          catch (cause) { if (!disposed) setError(messageFor(getInternetVoiceErrorCode(cause))); }
        }
        if (result.status === 'connected') setActiveCall((current) => current?.callId === callId ? { ...current, status: 'connected' } : current);
      } catch (cause) {
        if (!disposed && getInternetVoiceErrorCode(cause) !== 'network_error') setError(messageFor(getInternetVoiceErrorCode(cause)));
      }
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function scheduleSignals() {
      if (disposed) return;
      if (appStateRef.current === 'active') await pollSignals();
      if (!disposed) timer = setTimeout(() => { void scheduleSignals(); }, voicePollDelayMs(SIGNAL_POLL_BASE_MS, SIGNAL_POLL_JITTER_MS));
    }
    void scheduleSignals();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [token, voiceReady, activeCall?.callId, activeCall?.transport]);

  useEffect(() => {
    if (!activeCall || activeCall.transport !== 'internet_voice' || activeCall.status !== 'connected') return;
    let disposed = false;
    const callId = activeCall.callId;
    async function heartbeat() {
      try {
        const result = await heartbeatInternetVoiceCall(token, callId);
        if (disposed) return;
        setTiming(result.timing);
        if (result.terminal) {
          cleanupRtc();
          await refresh().catch(() => undefined);
        }
      } catch (cause) {
        if (!disposed && getInternetVoiceErrorCode(cause) !== 'network_error') setError(messageFor(getInternetVoiceErrorCode(cause)));
      }
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function scheduleHeartbeat() {
      if (disposed) return;
      if (appStateRef.current === 'active') await heartbeat();
      if (!disposed) timer = setTimeout(() => { void scheduleHeartbeat(); }, voicePollDelayMs(HEARTBEAT_BASE_MS, HEARTBEAT_JITTER_MS));
    }
    void scheduleHeartbeat();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [token, activeCall?.callId, activeCall?.status, activeCall?.transport]);

  async function endActiveCall() {
    if (!activeCall || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (activeCall.transport === 'internet_voice') {
        await endInternetVoiceCall(token, activeCall.callId, activeCall.status === 'calling_listener' ? 'listener_declined' : 'listener_ended');
      } else {
        await safetyExitCall(token, activeCall.callId);
      }
      cleanupRtc();
      setNotice(activeCall.status === 'calling_listener' ? 'تماس رد شد.' : 'تماس پایان یافت.');
    } catch (cause) {
      const voiceCode = getInternetVoiceErrorCode(cause);
      setError(messageFor(voiceCode === 'network_error' ? getErrorCode(cause) : voiceCode));
    } finally {
      await refresh().catch(() => undefined);
      await refreshRecent().catch(() => undefined);
      setBusy(false);
    }
  }

  async function exitSafely() {
    if (!activeCall || busy || activeCall.terminationInProgress) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (activeCall.transport === 'internet_voice') await safetyExitInternetVoiceCall(token, activeCall.callId);
      else await safetyExitCall(token, activeCall.callId);
      cleanupRtc();
      setNotice('توقف ایمن ثبت شد.');
    } catch (cause) {
      const voiceCode = getInternetVoiceErrorCode(cause);
      const code = voiceCode === 'network_error' ? getErrorCode(cause) : voiceCode;
      if (terminationLockCodes.has(code)) setActiveCall((current) => current ? { ...current, terminationInProgress: true } : current);
      setError(messageFor(code));
    } finally {
      await refresh().catch(() => undefined);
      await refreshRecent().catch(() => undefined);
      setBusy(false);
    }
  }

  async function blockRecent(callId: string) {
    if (recentBusyId) return;
    setRecentBusyId(callId); setError(''); setNotice('');
    try { await blockCallCounterparty(token, callId); setNotice('طرف مقابل این تماس مسدود شد.'); }
    catch (cause) { setError(messageFor(getErrorCode(cause))); }
    finally { setRecentBusyId(null); }
  }

  async function reportRecent(callId: string, category: string) {
    if (recentBusyId) return;
    setRecentBusyId(callId); setError(''); setNotice('');
    try { await reportCallSafety(token, { callId, category }); setReportCallId(null); setNotice('گزارش ثبت شد.'); }
    catch (cause) { setError(messageFor(getErrorCode(cause))); }
    finally { setRecentBusyId(null); }
  }

  const internetVoice = activeCall?.transport === 'internet_voice' || activeCall?.internetVoiceReady === true;
  const canSafetyExit = Boolean(activeCall && !activeCall.terminationInProgress && (activeCall.status === 'calling_listener' || activeCall.status === 'connected'));
  const remaining = timing?.remainingSeconds;
  const warning = remaining !== null && remaining !== undefined && remaining > 0 && remaining <= 120
    ? (remaining <= 60 ? 'کمتر از ۱ دقیقه باقی مانده.' : 'کمتر از ۲ دقیقه باقی مانده.')
    : '';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>تماس فعال</Text>
        <Text style={[styles.pill, activeCall && styles.livePill]}>{activeCall ? 'LIVE' : 'IDLE'}</Text>
      </View>

      {!activeCall && !error && <Text style={styles.helper}>در حال حاضر تماسی به این حساب اختصاص داده نشده است.</Text>}

      {activeCall && (
        <>
          <Text style={styles.status}>{statusLabel(activeCall.status)}</Text>
          <View style={styles.facts}>
            <Text style={styles.fact}>مسیر: {internetVoice ? 'Internet Voice' : 'Masked PSTN fallback'}</Text>
            <Text style={styles.fact}>حداکثر زمان مجاز: {activeCall.maxBillableSeconds ? `${activeCall.maxBillableSeconds.toLocaleString('fa-IR')} ثانیه` : '—'}</Text>
            <Text style={styles.fact}>ثانیه ثبت‌شده: {activeCall.billableSeconds.toLocaleString('fa-IR')}</Text>
            {activeCall.status === 'connected' && internetVoice && <Text style={styles.timer}>زمان باقی‌مانده: {formatRemaining(remaining)}</Text>}
          </View>
          {!!warning && <Text style={styles.warning}>{warning}</Text>}

          {internetVoice && activeCall.status === 'calling_listener' && !voiceReady && (
            <TouchableOpacity disabled={busy} style={[styles.answerButton, busy && styles.disabled]} onPress={() => { void answerInternetCall(); }}>
              <Text style={styles.answerText}>{busy ? 'در حال اتصال…' : 'پاسخ تماس'}</Text>
            </TouchableOpacity>
          )}
          {internetVoice && voiceReady && activeCall.status !== 'connected' && <Text style={styles.helper}>پاسخ ثبت شده؛ منتظر اتصال واقعی صدای هر دو طرف هستیم. زمان صورتحساب هنوز شروع نشده است.</Text>}

          {activeCall.terminationInProgress && <Text style={styles.error}>پایان این تماس قبلاً شروع شده است. کنترل پایان دوباره ارسال نمی‌شود.</Text>}

          {(activeCall.status === 'calling_listener' || activeCall.status === 'connected') && (
            <TouchableOpacity disabled={busy} style={[styles.endButton, busy && styles.disabled]} onPress={() => { void endActiveCall(); }}>
              <Text style={styles.endText}>{activeCall.status === 'calling_listener' ? 'رد تماس' : 'پایان تماس'}</Text>
            </TouchableOpacity>
          )}

          {canSafetyExit && (
            <TouchableOpacity
              disabled={busy}
              onPress={() => Alert.alert('پایان ایمن تماس', 'این کار تماس را فوراً از مسیر Safety Exit متوقف می‌کند. ادامه می‌دهی؟', [
                { text: 'نه', style: 'cancel' },
                { text: 'پایان ایمن', style: 'destructive', onPress: () => { void exitSafely(); } },
              ])}
              style={[styles.safetyButton, busy && styles.disabled]}
            >
              <Text style={styles.safetyText}>{busy ? 'در حال ثبت توقف…' : 'Safety Exit'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <View style={styles.divider} />
      <View style={styles.header}><Text style={styles.title}>تماس‌های اخیر</Text><TouchableOpacity onPress={() => { void refreshRecent(); }}><Text style={styles.refresh}>به‌روزرسانی</Text></TouchableOpacity></View>
      {!recentCalls.length && <Text style={styles.helper}>هنوز تماس پایان‌یافته‌ای برای نمایش وجود ندارد.</Text>}

      {recentCalls.map((item) => (
        <View key={item.callId} style={styles.recentItem}>
          <View style={styles.header}><Text style={styles.status}>{recentStatusLabel(item.status)}</Text><Text style={styles.meta}>{item.endedAt ? new Date(item.endedAt).toLocaleString('fa-IR') : 'زمان پایان ثبت نشده'}</Text></View>
          <Text style={styles.fact}>مدت ثبت‌شده: {item.billableSeconds.toLocaleString('fa-IR')} ثانیه</Text>
          {item.counterpartyActionAvailable && (
            <View style={styles.recentActions}>
              <TouchableOpacity disabled={Boolean(recentBusyId)} style={[styles.outlineButton, recentBusyId === item.callId && styles.disabled]} onPress={() => setReportCallId((current) => current === item.callId ? null : item.callId)}><Text style={styles.outlineText}>گزارش</Text></TouchableOpacity>
              <TouchableOpacity disabled={Boolean(recentBusyId)} style={[styles.blockButton, recentBusyId === item.callId && styles.disabled]} onPress={() => Alert.alert('مسدودکردن طرف مقابل', 'بعد از مسدودکردن، این دو حساب نباید دوباره برای تماس به هم متصل شوند. ادامه می‌دهی؟', [
                { text: 'نه', style: 'cancel' },
                { text: 'مسدود کن', style: 'destructive', onPress: () => { void blockRecent(item.callId); } },
              ])}><Text style={styles.blockText}>مسدودکردن</Text></TouchableOpacity>
            </View>
          )}
          {reportCallId === item.callId && item.counterpartyActionAvailable && (
            <View style={styles.reportPanel}>
              <Text style={styles.helper}>دسته گزارش را انتخاب کن. هویت طرف مقابل در این صفحه نمایش داده نمی‌شود.</Text>
              <View style={styles.categories}>
                {reportCategories.map((category) => (
                  <TouchableOpacity key={category.code} disabled={Boolean(recentBusyId)} style={styles.categoryButton} onPress={() => Alert.alert('ثبت گزارش', `گزارش «${category.label}» برای این تماس ثبت شود؟`, [
                    { text: 'نه', style: 'cancel' },
                    { text: 'ثبت گزارش', onPress: () => { void reportRecent(item.callId, category.code); } },
                  ])}><Text style={styles.categoryText}>{category.label}</Text></TouchableOpacity>
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
  timer: { color: '#20211f', textAlign: 'right', fontSize: 17, fontWeight: '800' },
  warning: { textAlign: 'right', color: '#8A5200', backgroundColor: '#FFF2D6', borderRadius: 10, padding: 10 },
  meta: { color: '#77756e', textAlign: 'left', fontSize: 11, flexShrink: 1 },
  answerButton: { backgroundColor: '#315a36', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 13 },
  answerText: { color: '#ffffff', textAlign: 'center', fontWeight: '800' },
  endButton: { borderWidth: 1, borderColor: '#53534e', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 13 },
  endText: { color: '#3f403c', textAlign: 'center', fontWeight: '800' },
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
