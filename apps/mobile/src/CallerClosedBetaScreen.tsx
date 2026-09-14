import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import {
  browseListeners,
  cancelCall,
  confirmCallerAge,
  getActiveCall,
  getCall,
  getErrorCode,
  requestCall,
  type BrowseListener,
  type CallResponse,
} from './api';
import {
  endInternetVoiceCall,
  expireInternetVoiceNoAnswer,
  extendInternetVoiceCall,
  getInternetVoiceConfig,
  getInternetVoiceErrorCode,
  getInternetVoiceSignals,
  heartbeatInternetVoiceCall,
  postInternetVoiceSignal,
  safetyExitInternetVoiceCall,
  startInternetVoiceCall,
  type InternetVoiceClientConfig,
  type InternetVoiceSignal,
  type InternetVoiceTiming,
} from './internet-voice-api';
import CallerWalletCard from './CallerWalletCard';
import CallerRecentCallsCard from './CallerRecentCallsCard';

type Props = {
  token: string;
  onClose: () => void;
};

type Stage = 'age-gate' | 'browse' | 'call';
type CallerCallResponse = CallResponse & { transport?: 'internet_voice' | 'masked_pstn' | null };
type CapMinutes = 10 | 30 | 60;

const terminalStatuses = new Set(['completed', 'missed', 'failed', 'cancelled', 'safety_terminated']);
const CALL_STATUS_POLL_MS = 3_000;
const SIGNAL_POLL_MS = 1_000;
const HEARTBEAT_MS = 5_000;

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    caller_closed_beta_disabled: 'مسیر تماس‌گیرنده برای این محیط فعال نیست.',
    caller_age_policy_not_configured: 'سیاست سنی Caller هنوز برای این محیط فعال نشده.',
    caller_age_gate_required: 'برای ادامه باید شرط سنی نسخه جاری را تأیید کنی.',
    caller_consent_required: 'برای ادامه باید قوانین استفاده و مرزبندی ایمنی را بپذیری.',
    caller_call_already_active: 'یک تماس فعال از قبل وجود دارد؛ همان تماس بازیابی می‌شود.',
    caller_active_call_conflict: 'چند تماس فعال همزمان پیدا شد. برای جلوگیری از انتخاب اشتباه، ادامه متوقف شده و نیاز به بررسی دارد.',
    no_listener_available: 'این شنونده دیگر آماده نیست؛ فهرست آماده‌ها به‌روزرسانی شد.',
    insufficient_balance: 'موجودی کیف پول برای شروع این سقف تماس کافی نیست.',
    insufficient_balance_for_extension: 'موجودی کیف پول برای این افزایش زمان کافی نیست.',
    call_transport_not_configured: 'مسیر تماس اینترنتی در این محیط آماده نیست.',
    internet_voice_not_primary: 'مسیر اصلی تماس این محیط Internet Voice نیست.',
    internet_voice_turn_required: 'TURN برای تماس اینترنتی Production آماده نیست.',
    call_not_internet_voice: 'این تماس با مسیر Internet Voice ساخته نشده است.',
    call_not_active: 'این تماس دیگر فعال نیست.',
    call_not_live: 'این تماس دیگر فعال نیست.',
    call_not_extendable: 'این تماس در وضعیت قابل افزایش زمان نیست.',
    call_end_conflict: 'پایان تماس همزمان از مسیر دیگری ثبت شده؛ وضعیت تماس را به‌روزرسانی کن.',
    no_answer_window_active: 'مهلت پاسخ شنونده هنوز تمام نشده است.',
    listener_already_answered: 'شنونده پاسخ داده و اتصال صوتی در حال کامل‌شدن است.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد.';
}

function formatRemaining(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes.toLocaleString('fa-IR')}:${rest.toString().padStart(2, '0')}`;
}

function warningFor(timing: InternetVoiceTiming | null): string {
  const remaining = timing?.remainingSeconds;
  if (remaining === null || remaining === undefined) return '';
  if (remaining <= 60 && remaining > 0) return 'کمتر از ۱ دقیقه از سقف تماس باقی مانده.';
  if (remaining <= 120 && remaining > 60) return 'کمتر از ۲ دقیقه از سقف تماس باقی مانده.';
  return '';
}

export default function CallerClosedBetaScreen({ token, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('age-gate');
  const [minimumAge, setMinimumAge] = useState<number | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [listeners, setListeners] = useState<BrowseListener[]>([]);
  const [selected, setSelected] = useState<BrowseListener | null>(null);
  const [call, setCall] = useState<CallerCallResponse | null>(null);
  const [maxMinutes, setMaxMinutes] = useState<CapMinutes>(10);
  const [busy, setBusy] = useState(false);
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [noAnswerDeadlineMs, setNoAnswerDeadlineMs] = useState<number | null>(null);
  const [timing, setTiming] = useState<InternetVoiceTiming | null>(null);
  const [error, setError] = useState('');

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalIdsRef = useRef(new Set<string>());
  const postedMediaConnectedRef = useRef(false);
  const noAnswerExpiryInFlightRef = useRef(false);
  const policiesReady = ageConfirmed && termsAccepted && safetyAccepted;

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

  useEffect(() => {
    let disposed = false;
    async function recoverActiveCall() {
      try {
        const result = await getActiveCall(token);
        if (disposed) return;
        if (result.activeCall) {
          setCall(result.activeCall as CallerCallResponse);
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
          setCall((current) => current?.callId === callId ? next as CallerCallResponse : current);
          if (terminalStatuses.has(next.status)) cleanupRtc();
        }
      } catch (cause) {
        if (!disposed && getErrorCode(cause) !== 'network_error') setError(messageFor(getErrorCode(cause)));
      }
    }
    const timer = setInterval(() => { void syncLiveCall(); }, CALL_STATUS_POLL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [token, stage, call?.callId, call?.status]);

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
        setCall((current) => current?.callId === callId ? { ...current, status: 'connected' } : current);
        setNoAnswerDeadlineMs(null);
      }
    } catch (cause) {
      postedMediaConnectedRef.current = false;
      setError(messageFor(getInternetVoiceErrorCode(cause)));
    }
  }

  async function createCallerPeer(callId: string, client: InternetVoiceClientConfig, stream: MediaStream) {
    const prior = peerRef.current;
    try { prior?.close(); } catch {}
    processedSignalIdsRef.current.clear();
    postedMediaConnectedRef.current = false;

    const peer = new RTCPeerConnection({ iceServers: client.iceServers });
    peerRef.current = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
      if (!event.candidate) return;
      void postInternetVoiceSignal(token, callId, 'ice', event.candidate.toJSON()).catch((cause) => {
        setError(messageFor(getInternetVoiceErrorCode(cause)));
      });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        void postInternetVoiceSignal(token, callId, 'reconnected', { source: 'peer_connection_state' }).catch(() => undefined);
        void postMediaConnected(callId);
      }
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        void postInternetVoiceSignal(token, callId, 'reconnecting', { source: 'peer_connection_state' }).catch(() => undefined);
      }
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') setVoiceReady(false);
    };

    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await peer.setLocalDescription(offer);
    await postInternetVoiceSignal(token, callId, 'offer', { type: offer.type, sdp: offer.sdp });
    setVoiceReady(true);
  }

  async function consumeListenerSignal(signal: InternetVoiceSignal) {
    const peer = peerRef.current;
    if (!peer || signal.senderRole !== 'listener') return;
    if (processedSignalIdsRef.current.has(signal.id)) return;
    if (signal.kind === 'answer') {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as never));
      processedSignalIdsRef.current.add(signal.id);
      setNoAnswerDeadlineMs(null);
      return;
    }
    if (signal.kind === 'ice') {
      if (!peer.remoteDescription) return;
      await peer.addIceCandidate(new RTCIceCandidate(signal.payload as never));
      processedSignalIdsRef.current.add(signal.id);
      return;
    }
    if (signal.kind === 'media_connected' || signal.kind === 'reconnecting' || signal.kind === 'reconnected') {
      processedSignalIdsRef.current.add(signal.id);
    }
  }

  useEffect(() => {
    if (!voiceReady || !call || terminalStatuses.has(call.status)) return;
    let disposed = false;
    const callId = call.callId;
    async function pollSignals() {
      try {
        const result = await getInternetVoiceSignals(token, callId);
        if (disposed) return;
        for (const signal of result.signals) {
          try { await consumeListenerSignal(signal); }
          catch (cause) { if (!disposed) setError(messageFor(getInternetVoiceErrorCode(cause))); }
        }
        if (result.status === 'connected') {
          setCall((current) => current?.callId === callId ? { ...current, status: 'connected' } : current);
          setNoAnswerDeadlineMs(null);
        }
      } catch (cause) {
        if (!disposed && getInternetVoiceErrorCode(cause) !== 'network_error') setError(messageFor(getInternetVoiceErrorCode(cause)));
      }
    }
    void pollSignals();
    const timer = setInterval(() => { void pollSignals(); }, SIGNAL_POLL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [token, voiceReady, call?.callId, call?.status]);

  useEffect(() => {
    if (!call || call.status !== 'connected') return;
    let disposed = false;
    const callId = call.callId;
    async function heartbeat() {
      if (peerRef.current?.connectionState !== 'connected') return;
      try {
        const result = await heartbeatInternetVoiceCall(token, callId);
        if (disposed) return;
        setTiming(result.timing);
        if (result.terminal) {
          setCall((current) => current?.callId === callId ? { ...current, status: result.status } : current);
          cleanupRtc();
        }
      } catch (cause) {
        if (!disposed && getInternetVoiceErrorCode(cause) !== 'network_error') setError(messageFor(getInternetVoiceErrorCode(cause)));
      }
    }
    void heartbeat();
    const timer = setInterval(() => { void heartbeat(); }, HEARTBEAT_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [token, call?.callId, call?.status]);

  useEffect(() => {
    if (!call || call.status !== 'calling_listener' || noAnswerDeadlineMs === null) return;
    const callId = call.callId;
    const timer = setInterval(() => {
      if (Date.now() < noAnswerDeadlineMs || noAnswerExpiryInFlightRef.current) return;
      noAnswerExpiryInFlightRef.current = true;
      void expireInternetVoiceNoAnswer(token, callId)
        .then((result) => {
          setCall((current) => current?.callId === callId ? { ...current, status: result.status } : current);
          cleanupRtc();
        })
        .catch((cause) => {
          const code = getInternetVoiceErrorCode(cause);
          if (code === 'listener_already_answered') setNoAnswerDeadlineMs(null);
          else if (code !== 'no_answer_window_active') setError(messageFor(code));
        })
        .finally(() => { noAnswerExpiryInFlightRef.current = false; });
    }, 1_000);
    return () => clearInterval(timer);
  }, [token, call?.callId, call?.status, noAnswerDeadlineMs]);

  async function acceptAgeGate() {
    if (recoveryBlocked || !policiesReady) return;
    setBusy(true);
    setError('');
    try {
      const result = await confirmCallerAge(token, { termsAccepted, safetyAccepted });
      setMinimumAge(result.minimumAge);
      const browse = await browseListeners(token, { limit: 20 });
      setListeners(browse.listeners);
      setStage('browse');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally { setBusy(false); }
  }

  async function refreshListeners() {
    if (recoveryBlocked) return;
    setBusy(true);
    setError('');
    try {
      const result = await browseListeners(token, { limit: 20 });
      setListeners(result.listeners);
    } catch (cause) { setError(messageFor(getErrorCode(cause))); }
    finally { setBusy(false); }
  }

  async function startCall(listener: BrowseListener) {
    if (recoveryBlocked) return;
    const languageCode = listener.languages[0]?.code;
    if (!languageCode) { setError('برای این شنونده زبان فعالی ثبت نشده.'); return; }
    setBusy(true);
    setError('');
    let requested: CallResponse | null = null;
    let voiceStarted = false;
    try {
      // Permission is requested before the server creates the Wallet HOLD.
      const stream = await ensureMicrophone();
      requested = await requestCall(token, {
        clientRequestId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        listenerId: listener.id,
        languageCode,
        mood: 'just_talk',
        maxSeconds: maxMinutes * 60,
      });
      setSelected(listener);
      setCall(requested as CallerCallResponse);
      setStage('call');

      const startedCallId = requested.callId;
      const started = await startInternetVoiceCall(token, startedCallId);
      voiceStarted = true;
      setCall((current) => current && current.callId === startedCallId ? {
        ...current,
        status: started.status,
        transport: 'internet_voice',
      } : current);
      setNoAnswerDeadlineMs(Date.now() + started.noAnswerSeconds * 1_000);
      await createCallerPeer(startedCallId, started.client, stream);
    } catch (cause) {
      const code = getInternetVoiceErrorCode(cause) === 'network_error' ? getErrorCode(cause) : getInternetVoiceErrorCode(cause);
      if (requested) {
        try {
          if (voiceStarted) await endInternetVoiceCall(token, requested.callId, 'mobile_start_failed');
          else await cancelCall(token, requested.callId);
        } catch {}
      }
      cleanupRtc();
      if (code === 'caller_call_already_active') {
        try {
          const recovered = await getActiveCall(token);
          if (recovered.activeCall) {
            setSelected(null);
            setCall(recovered.activeCall as CallerCallResponse);
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
        try { setListeners((await browseListeners(token, { limit: 20 })).listeners); } catch {}
      }
      setError(messageFor(code));
    } finally { setBusy(false); }
  }

  async function reconnectVoice() {
    if (!call || terminalStatuses.has(call.status)) return;
    setBusy(true);
    setError('');
    try {
      const stream = await ensureMicrophone();
      const config = await getInternetVoiceConfig(token, call.callId);
      await createCallerPeer(call.callId, config.client, stream);
      if (config.status === 'calling_listener') setNoAnswerDeadlineMs(Date.now() + config.noAnswerSeconds * 1_000);
    } catch (cause) {
      setError(messageFor(getInternetVoiceErrorCode(cause)));
      cleanupRtc();
    } finally { setBusy(false); }
  }

  async function refreshCall() {
    if (!call) return;
    setBusy(true);
    setError('');
    try { setCall(await getCall(token, call.callId) as CallerCallResponse); }
    catch (cause) { setError(messageFor(getErrorCode(cause))); }
    finally { setBusy(false); }
  }

  async function endCall() {
    if (!call || terminalStatuses.has(call.status)) return;
    setBusy(true);
    setError('');
    try {
      if (call.status === 'routing') setCall(await cancelCall(token, call.callId) as CallerCallResponse);
      else {
        const ended = await endInternetVoiceCall(token, call.callId);
        setCall((current) => current ? { ...current, status: ended.status, billableSeconds: ended.billableSeconds } : current);
      }
      cleanupRtc();
    } catch (cause) {
      const voiceCode = getInternetVoiceErrorCode(cause);
      setError(messageFor(voiceCode === 'network_error' ? getErrorCode(cause) : voiceCode));
    } finally { setBusy(false); }
  }

  async function safetyExit() {
    if (!call || terminalStatuses.has(call.status)) return;
    setBusy(true);
    setError('');
    try {
      const ended = await safetyExitInternetVoiceCall(token, call.callId);
      setCall((current) => current ? { ...current, status: ended.status, billableSeconds: ended.billableSeconds } : current);
      cleanupRtc();
    } catch (cause) { setError(messageFor(getInternetVoiceErrorCode(cause))); }
    finally { setBusy(false); }
  }

  async function extend(minutes: 15 | 30) {
    if (!call || call.status !== 'connected') return;
    setBusy(true);
    setError('');
    try {
      const result = await extendInternetVoiceCall(
        token,
        call.callId,
        minutes,
        `mobile-ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      );
      setTiming(result.timing);
      setCall((current) => current ? { ...current, maxBillableSeconds: result.maxBillableSeconds } : current);
    } catch (cause) { setError(messageFor(getInternetVoiceErrorCode(cause))); }
    finally { setBusy(false); }
  }

  const warning = warningFor(timing);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>تماس اینترنتی با شنونده انسانی</Text>
      <Text style={styles.note}>ویژه ۱۸ سال و بالاتر · تماس زنده WebRTC · برای امنیت کاربران، مکالمه توسط پلتفرم ضبط و امن نگهداری می‌شود. این سرویس درمانی، پزشکی، دوست‌یابی یا اضطراری نیست.</Text>

      {!recoveryComplete && <View style={styles.card}><Text style={styles.heading}>بررسی تماس جاری</Text><Text style={styles.body}>اگر تماس فعالی داشته باشی، همان تماس از سرور بازیابی می‌شود.</Text></View>}

      {recoveryComplete && !recoveryBlocked && stage === 'browse' && <CallerWalletCard token={token} />}

      {recoveryComplete && recoveryBlocked && (
        <View style={styles.card}><Text style={styles.heading}>نیاز به بررسی تماس</Text><Text style={styles.body}>چند تماس فعال همزمان در سرور ثبت شده است. شروع تماس جدید تا بررسی این وضعیت بسته می‌ماند.</Text></View>
      )}

      {recoveryComplete && !recoveryBlocked && stage === 'age-gate' && (
  <View style={styles.card}>
    <Text style={styles.heading}>تأیید سن و قوانین</Text>
    <Text style={styles.body}>قبل از دیدن شنونده‌ها هر سه مورد را جداگانه تأیید کن.</Text>
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: ageConfirmed, disabled: busy }} disabled={busy} style={[styles.policyRow, ageConfirmed && styles.policyRowActive]} onPress={() => setAgeConfirmed((current) => !current)}>
      <Text style={styles.policyText}>{ageConfirmed ? '☑' : '☐'} تأیید می‌کنم ۱۸ سال یا بیشتر دارم.</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted, disabled: busy }} disabled={busy} style={[styles.policyRow, termsAccepted && styles.policyRowActive]} onPress={() => setTermsAccepted((current) => !current)}>
      <Text style={styles.policyText}>{termsAccepted ? '☑' : '☐'} قوانین استفاده را خواندم و می‌پذیرم. لینک «قوانین استفاده» پایین صفحه در دسترس است.</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: safetyAccepted, disabled: busy }} disabled={busy} style={[styles.policyRow, safetyAccepted && styles.policyRowActive]} onPress={() => setSafetyAccepted((current) => !current)}>
      <Text style={styles.policyText}>{safetyAccepted ? '☑' : '☐'} می‌پذیرم محترمانه رفتار کنم؛ اینجا محل دوست‌یابی یا مشاوره تخصصی نیست و اطلاعات تماس شخصی ردوبدل نمی‌کنم.</Text>
    </TouchableOpacity>
    <TouchableOpacity disabled={busy || !policiesReady} style={[styles.primary, !policiesReady && styles.disabled]} onPress={acceptAgeGate}>
      <Text style={styles.primaryText}>{busy ? 'در حال بررسی…' : 'تأیید و ادامه'}</Text>
    </TouchableOpacity>
  </View>
)}

      {recoveryComplete && !recoveryBlocked && stage === 'browse' && (
        <View style={styles.card}>
          <Text style={styles.heading}>شنونده‌های آماده</Text>
          {minimumAge !== null && <Text style={styles.meta}>سیاست جاری: حداقل {minimumAge} سال</Text>}
          <Text style={styles.body}>حداکثر زمان اولیه را انتخاب کن. فقط زمان بعد از اتصال واقعی هر دو طرف صورتحساب می‌شود.</Text>
          <View style={styles.capRow}>
            {([10, 30, 60] as CapMinutes[]).map((minutes) => (
              <TouchableOpacity key={minutes} disabled={busy} style={[styles.capButton, maxMinutes === minutes && styles.capButtonActive]} onPress={() => setMaxMinutes(minutes)}>
                <Text style={[styles.capText, maxMinutes === minutes && styles.capTextActive]}>{minutes.toLocaleString('fa-IR')} دقیقه</Text>
              </TouchableOpacity>
            ))}
          </View>
          {listeners.length === 0 && <Text style={styles.body}>فعلاً شنونده Online نمایش داده نشد.</Text>}
          {listeners.map((listener) => (
            <View key={listener.id} style={styles.listener}>
              <View style={styles.listenerText}>
                <Text style={styles.listenerName}>{listener.nickname}</Text>
                <Text style={styles.meta}>{listener.verified ? 'حساب شنونده برای فعالیت تأیید شده؛ جزئیات پروفایل خوداظهاری است.' : 'حساب شنونده هنوز برای فعالیت تأیید نشده؛ جزئیات پروفایل خوداظهاری است.'} · {listener.languages.map((x) => x.nameFa).join(' · ') || 'زبان ثبت نشده'}</Text>
                {!!listener.shortIntro && <Text style={styles.body}>معرفی خوداظهاری (تأییدنشده): {listener.shortIntro}</Text>}
              </View>
              <TouchableOpacity disabled={busy} style={styles.smallButton} onPress={() => { void startCall(listener); }}><Text style={styles.smallButtonText}>تماس</Text></TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity disabled={busy} onPress={() => { void refreshListeners(); }}><Text style={styles.link}>به‌روزرسانی فهرست</Text></TouchableOpacity>
        </View>
      )}

      {recoveryComplete && stage === 'call' && call && (
        <View style={styles.card}>
          <Text style={styles.heading}>{selected?.nickname ?? 'تماس جاری'}</Text>
          <Text style={styles.status}>وضعیت: {call.status}</Text>
          {call.status === 'calling_listener' && <Text style={styles.body}>در انتظار پاسخ شنونده. اگر پاسخ ندهد، HOLD آزاد و شنونده خودکار Offline می‌شود.</Text>}
          {call.status === 'connected' && <Text style={styles.timer}>زمان باقی‌مانده: {formatRemaining(timing?.remainingSeconds)}</Text>}
          {!!warning && <Text style={styles.warning}>{warning}</Text>}

          {!terminalStatuses.has(call.status) && call.status !== 'routing' && !voiceReady && (
            <TouchableOpacity disabled={busy} style={styles.primary} onPress={() => { void reconnectVoice(); }}><Text style={styles.primaryText}>{busy ? 'در حال اتصال…' : 'اتصال/ادامه صدای اینترنتی'}</Text></TouchableOpacity>
          )}

          {call.status === 'connected' && (
            <View style={styles.capRow}>
              <TouchableOpacity disabled={busy} style={styles.secondaryFlex} onPress={() => { void extend(15); }}><Text style={styles.secondaryText}>+۱۵ دقیقه</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy} style={styles.secondaryFlex} onPress={() => { void extend(30); }}><Text style={styles.secondaryText}>+۳۰ دقیقه</Text></TouchableOpacity>
            </View>
          )}

          {!terminalStatuses.has(call.status) && (
            <>
              <TouchableOpacity disabled={busy} onPress={() => { void refreshCall(); }}><Text style={styles.link}>به‌روزرسانی وضعیت</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy} style={styles.secondary} onPress={() => { void endCall(); }}><Text style={styles.secondaryText}>پایان تماس</Text></TouchableOpacity>
              {call.status !== 'routing' && <TouchableOpacity disabled={busy} style={styles.safety} onPress={() => { void safetyExit(); }}><Text style={styles.safetyText}>پایان فوری برای ایمنی</Text></TouchableOpacity>}
            </>
          )}

          {terminalStatuses.has(call.status) && (
            <TouchableOpacity onPress={() => { cleanupRtc(); setTiming(null); setCall(null); setSelected(null); setStage('browse'); }}><Text style={styles.link}>برگشت به شنونده‌ها</Text></TouchableOpacity>
          )}
        </View>
      )}

      {recoveryComplete && <CallerRecentCallsCard token={token} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity onPress={() => { cleanupRtc(); onClose(); }}><Text style={styles.close}>بستن</Text></TouchableOpacity>
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
  disabled: { opacity: 0.45 },
  policyRow: { borderWidth: 1, borderColor: '#D8D1C7', borderRadius: 12, padding: 12, backgroundColor: '#FFF' },
  policyRowActive: { borderColor: '#171717', backgroundColor: '#F3F0EA' },
  policyText: { fontSize: 13, lineHeight: 21, textAlign: 'right' },
  listener: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#EEE9E2', paddingTop: 12 },
  listenerText: { flex: 1, gap: 4 },
  listenerName: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
  smallButton: { borderWidth: 1, borderColor: '#171717', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  smallButtonText: { fontWeight: '700' },
  capRow: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  capButton: { borderWidth: 1, borderColor: '#CFC7BC', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 },
  capButtonActive: { backgroundColor: '#171717', borderColor: '#171717' },
  capText: { fontWeight: '600' },
  capTextActive: { color: '#FFF' },
  status: { textAlign: 'right', fontWeight: '600' },
  timer: { textAlign: 'right', fontSize: 20, fontWeight: '800' },
  warning: { textAlign: 'right', color: '#8A5200', backgroundColor: '#FFF2D6', borderRadius: 10, padding: 10 },
  link: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 8 },
  secondary: { borderWidth: 1, borderColor: '#171717', borderRadius: 12, padding: 12 },
  secondaryFlex: { borderWidth: 1, borderColor: '#171717', borderRadius: 12, padding: 12, flex: 1 },
  secondaryText: { textAlign: 'center', fontWeight: '700' },
  safety: { borderWidth: 1, borderColor: '#9E2525', borderRadius: 12, padding: 12 },
  safetyText: { color: '#9E2525', textAlign: 'center', fontWeight: '700' },
  error: { color: '#9E2525', textAlign: 'right', lineHeight: 21 },
  close: { textAlign: 'center', opacity: 0.65, padding: 8 },
});
