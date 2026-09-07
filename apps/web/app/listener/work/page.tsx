'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type PresenceStatus = 'online' | 'offline' | 'paused';

type Presence = {
  status: PresenceStatus;
  acceptsMale: boolean;
  acceptsFemale: boolean;
  onlineSince: string | null;
  lastHeartbeatAt: string | null;
};

type ActiveCall = {
  callId: string;
  status: 'requested' | 'routing' | 'calling_caller' | 'caller_answered' | 'calling_listener' | 'connected';
  currencyCode: string;
  maxBillableSeconds: number | null;
  transport: 'internet_voice' | 'masked_pstn' | null;
  internetVoiceReady: boolean;
  telephonyReady: boolean;
  terminationInProgress: boolean;
  requestedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  billableSeconds: number;
  listenerEarningMinor: string;
};

type RecentCall = {
  callId: string;
  status: 'completed' | 'missed' | 'cancelled' | 'failed' | 'safety_terminated';
  currencyCode: string;
  requestedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  billableSeconds: number;
  listenerEarningMinor: string;
  counterpartyActionAvailable: boolean;
};

type EarningsSummary = {
  currencyCode: string;
  status: 'pending' | 'available' | 'paid';
  amountMinor: string;
  earningCount: number;
};

type VoiceSignal = {
  id: string;
  createdAt: string;
  kind: 'offer' | 'answer' | 'ice' | 'media_connected' | 'reconnecting' | 'reconnected';
  senderRole: 'caller' | 'listener';
  payload: unknown;
};

type VoiceConfig = {
  callId: string;
  transport: 'internet_voice';
  role: 'caller' | 'listener';
  status: string;
  noAnswerSeconds: number;
  client: { iceServers: RTCIceServer[]; relayConfigured: boolean };
  readiness: { relayConfigured: boolean; iranDomesticPathConfigured: boolean };
};

type VoiceTiming = {
  remainingSeconds: number | null;
  warning: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/listener/${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `http_${response.status}`);
  if (!body) throw new Error('invalid_response');
  return body;
}

function faNumber(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}

function formatMoney(amountMinor: string, currencyCode: string): string {
  if (currencyCode === 'IRR') return `${faNumber(Number(BigInt(amountMinor) / BigInt(10)))} تومان`;
  return `${amountMinor} ${currencyCode}`;
}

function formatClock(seconds: number | null): string {
  if (seconds === null) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${faNumber(minutes)}:${rest.toLocaleString('fa-IR', { minimumIntegerDigits: 2, useGrouping: false })}`;
}

function activeStatusLabel(status: ActiveCall['status']): string {
  const labels: Record<ActiveCall['status'], string> = {
    requested: 'درخواست تماس ثبت شده',
    routing: 'در حال آماده‌سازی تماس',
    calling_caller: 'در حال تماس با Caller',
    caller_answered: 'Caller پاسخ داده',
    calling_listener: 'تماس اینترنتی منتظر پاسخ توست',
    connected: 'تماس اینترنتی وصل است',
  };
  return labels[status];
}

function recentStatusLabel(status: RecentCall['status']): string {
  const labels: Record<RecentCall['status'], string> = {
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
    authentication_required: 'برای ورود به حالت کاری ابتدا از صفحه اصلی وارد حساب شو.',
    listener_not_approved: 'حساب شنونده هنوز برای کار فعال نشده است.',
    listener_verification_required: 'احراز هویت شنونده هنوز کامل نشده است.',
    listener_not_online: 'وضعیت Online منقضی شده؛ دوباره Online شو.',
    no_callers_accepted: 'برای Online شدن حداقل یک گروه Caller را فعال کن.',
    listener_active_call_conflict: 'بیش از یک تماس فعال برای این حساب ثبت شده؛ کنترل‌های کار تا بررسی وضعیت قفل‌اند.',
    call_not_internet_voice: 'این تماس از مسیر Internet Voice نیست.',
    call_not_live: 'این تماس دیگر فعال نیست.',
    call_not_found: 'این تماس دیگر در دسترس نیست.',
    voice_relay_not_ready: 'مسیر Relay امن برای تماس واقعی آماده نیست.',
    call_termination_in_progress: 'پایان تماس از مسیر دیگری شروع شده است.',
    backend_unavailable: 'ارتباط با سرویس اصلی برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره تلاش کن.';
}

export default function ListenerWorkPage() {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [acceptsMale, setAcceptsMale] = useState(true);
  const [acceptsFemale, setAcceptsFemale] = useState(true);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummary[]>([]);
  const [activeCallConflict, setActiveCallConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const presenceRef = useRef<Presence | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenSignalsRef = useRef(new Set<string>());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const mediaConnectedSentRef = useRef(false);
  const rtcCallIdRef = useRef<string | null>(null);

  const applyPresence = useCallback((value: Presence) => {
    presenceRef.current = value;
    setPresence(value);
    setAcceptsMale(value.acceptsMale);
    setAcceptsFemale(value.acceptsFemale);
  }, []);

  const cleanupRtc = useCallback(() => {
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    signalPollRef.current = null;
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    seenSignalsRef.current.clear();
    pendingCandidatesRef.current = [];
    mediaConnectedSentRef.current = false;
    rtcCallIdRef.current = null;
    setVoiceReady(false);
    setRemainingSeconds(null);
    setWarning(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const refreshPresence = useCallback(async () => {
    const value = await api<Presence>('listener/presence');
    applyPresence(value);
    return value;
  }, [applyPresence]);

  const refreshRecentAndEarnings = useCallback(async () => {
    const [recent, earningResult] = await Promise.all([
      api<{ calls: RecentCall[] }>('listener/calls/recent?limit=8'),
      api<{ summary: EarningsSummary[] }>('listener/earnings'),
    ]);
    setRecentCalls(recent.calls);
    setEarnings(earningResult.summary);
  }, []);

  const refreshActive = useCallback(async () => {
    try {
      const value = await api<{ activeCall: ActiveCall | null }>('listener/calls/active');
      const previousId = activeCallIdRef.current;
      const nextId = value.activeCall?.callId ?? null;
      activeCallIdRef.current = nextId;
      setActiveCall(value.activeCall);
      setActiveCallConflict(false);
      if (previousId && !nextId) {
        cleanupRtc();
        await refreshRecentAndEarnings().catch(() => undefined);
      }
      return value.activeCall;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'load_failed';
      if (code === 'listener_active_call_conflict') {
        activeCallIdRef.current = null;
        setActiveCall(null);
        setActiveCallConflict(true);
        cleanupRtc();
      }
      throw cause;
    }
  }, [cleanupRtc, refreshRecentAndEarnings]);

  const refreshAll = useCallback(async () => {
    setError('');
    try {
      await refreshPresence();
      await Promise.all([refreshActive(), refreshRecentAndEarnings()]);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'load_failed'));
    }
  }, [refreshActive, refreshPresence, refreshRecentAndEarnings]);

  useEffect(() => {
    void refreshAll();
    return cleanupRtc;
  }, [cleanupRtc, refreshAll]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (hasActiveCall: boolean) => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        try {
          const next = await refreshActive();
          schedule(Boolean(next));
        } catch (cause) {
          setError(messageFor(cause instanceof Error ? cause.message : 'load_failed'));
          schedule(false);
        }
      }, hasActiveCall ? 3_000 : 12_000);
    };

    schedule(Boolean(activeCallIdRef.current));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshActive]);

  useEffect(() => {
    const current = presence?.status;
    if (current !== 'online' && current !== 'paused') return;
    const heartbeat = async () => {
      if (document.hidden) return;
      try {
        await api('listener/presence/heartbeat', { method: 'POST', body: '{}' });
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : 'heartbeat_failed';
        if (code === 'listener_not_online') await refreshPresence().catch(() => undefined);
        setError(messageFor(code));
      }
    };
    const timer = setInterval(() => void heartbeat(), 30_000);
    return () => clearInterval(timer);
  }, [presence?.status, refreshPresence]);

  useEffect(() => {
    const forceOffline = () => {
      const current = presenceRef.current;
      if (!current || (current.status !== 'online' && current.status !== 'paused')) return;
      const next: Presence = {
        ...current,
        status: 'offline',
        onlineSince: null,
        lastHeartbeatAt: null,
      };
      applyPresence(next);
      const body = JSON.stringify({
        status: 'offline',
        acceptsMale: current.acceptsMale,
        acceptsFemale: current.acceptsFemale,
      });
      const beaconBody = new Blob([body], { type: 'application/json' });
      if (!navigator.sendBeacon('/api/listener/listener/presence', beaconBody)) {
        void api('listener/presence', { method: 'POST', body }).catch(() => undefined);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        forceOffline();
        return;
      }
      void refreshAll();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', forceOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', forceOffline);
    };
  }, [applyPresence, refreshAll]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected' || !voiceReady || rtcCallIdRef.current !== activeCall.callId) return;
    let running = false;
    const heartbeat = async () => {
      if (running || pcRef.current?.connectionState !== 'connected') return;
      running = true;
      try {
        const result = await api<{ terminal: boolean; capReached: boolean; timing: VoiceTiming }>(`calls/${activeCall.callId}/voice/heartbeat`, {
          method: 'POST',
          body: '{}',
        });
        setRemainingSeconds(result.timing.remainingSeconds);
        setWarning(result.timing.warning);
        if (result.terminal) {
          setNotice(result.capReached ? 'سقف زمان تماس رسید و تماس پایان یافت.' : 'تماس پایان یافت.');
          cleanupRtc();
          await refreshActive().catch(() => undefined);
        }
      } catch {
        // Server sweeper remains authoritative; the next heartbeat can recover.
      } finally {
        running = false;
      }
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 5_000);
    return () => clearInterval(timer);
  }, [activeCall, cleanupRtc, refreshActive, voiceReady]);

  async function changePresence(status: PresenceStatus) {
    if (busy) return;
    if (activeCallConflict && status !== 'offline') {
      setError(messageFor('listener_active_call_conflict'));
      return;
    }
    if (status === 'online' && !acceptsMale && !acceptsFemale) {
      setError(messageFor('no_callers_accepted'));
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ status: PresenceStatus; acceptsMale: boolean; acceptsFemale: boolean }>('listener/presence', {
        method: 'POST',
        body: JSON.stringify({ status, acceptsMale, acceptsFemale }),
      });
      applyPresence({
        status: result.status,
        acceptsMale: result.acceptsMale,
        acceptsFemale: result.acceptsFemale,
        onlineSince: result.status === 'online' ? presenceRef.current?.onlineSince ?? new Date().toISOString() : null,
        lastHeartbeatAt: result.status === 'offline' ? null : new Date().toISOString(),
      });
      setNotice(result.status === 'online'
        ? 'Online شدی. تا وقتی این تب باز و فعال است درخواست تماس را می‌بینی.'
        : result.status === 'paused'
          ? 'دریافت تماس جدید موقتاً متوقف شد.'
          : 'Offline شدی و تماس جدید برایت ارسال نمی‌شود.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'presence_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCallerPreference(kind: 'male' | 'female') {
    if (!presence || busy || activeCallConflict) return;
    const nextMale = kind === 'male' ? !acceptsMale : acceptsMale;
    const nextFemale = kind === 'female' ? !acceptsFemale : acceptsFemale;
    if (presence.status === 'online' && !nextMale && !nextFemale) {
      setError(messageFor('no_callers_accepted'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ status: PresenceStatus; acceptsMale: boolean; acceptsFemale: boolean }>('listener/presence', {
        method: 'POST',
        body: JSON.stringify({ status: presence.status, acceptsMale: nextMale, acceptsFemale: nextFemale }),
      });
      setAcceptsMale(result.acceptsMale);
      setAcceptsFemale(result.acceptsFemale);
      const next = { ...presence, acceptsMale: result.acceptsMale, acceptsFemale: result.acceptsFemale };
      presenceRef.current = next;
      setPresence(next);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'preference_failed'));
    } finally {
      setBusy(false);
    }
  }

  const consumeCallerSignal = useCallback(async (callId: string, pc: RTCPeerConnection, signal: VoiceSignal) => {
    if (signal.senderRole !== 'caller' || seenSignalsRef.current.has(signal.id)) return;
    if (signal.kind === 'ice') {
      const candidate = signal.payload as RTCIceCandidateInit;
      if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
      else pendingCandidatesRef.current.push(candidate);
      seenSignalsRef.current.add(signal.id);
      return;
    }
    if (signal.kind === 'media_connected' || signal.kind === 'reconnecting' || signal.kind === 'reconnected') {
      seenSignalsRef.current.add(signal.id);
    }
  }, []);

  const markMediaConnected = useCallback(async (callId: string) => {
    if (mediaConnectedSentRef.current) return;
    mediaConnectedSentRef.current = true;
    try {
      const result = await api<{ status: string; becameConnected: boolean }>(`calls/${callId}/voice/signals`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'media_connected', payload: { source: 'web_listener_rtc' } }),
      });
      setVoiceReady(true);
      setNotice(result.status === 'connected' || result.becameConnected
        ? 'تماس وصل شد. محاسبه زمان از اتصال واقعی دو طرف شروع می‌شود.'
        : 'صدای این سمت آماده است؛ در انتظار اتصال کامل Caller…');
      await refreshActive().catch(() => undefined);
    } catch {
      mediaConnectedSentRef.current = false;
    }
  }, [refreshActive]);

  const startSignalPolling = useCallback((callId: string, pc: RTCPeerConnection) => {
    if (signalPollRef.current) clearInterval(signalPollRef.current);
    let running = false;
    const poll = async () => {
      if (running || rtcCallIdRef.current !== callId) return;
      running = true;
      try {
        const result = await api<{ status: string; signals: VoiceSignal[] }>(`calls/${callId}/voice/signals`);
        for (const signal of result.signals) await consumeCallerSignal(callId, pc, signal);
        if (['completed', 'missed', 'cancelled', 'failed', 'safety_terminated'].includes(result.status)) {
          setNotice('تماس پایان یافت.');
          cleanupRtc();
          await refreshActive().catch(() => undefined);
        }
      } catch {
        // Short signaling failures are retried without converting them into fake terminal state.
      } finally {
        running = false;
      }
    };
    signalPollRef.current = setInterval(() => void poll(), 900);
    void poll();
  }, [cleanupRtc, consumeCallerSignal, refreshActive]);

  async function answerInternetCall() {
    if (!activeCall || activeCall.status !== 'calling_listener' || activeCall.transport !== 'internet_voice' || voiceBusy) return;
    setVoiceBusy(true);
    setError('');
    setNotice('در حال آماده‌سازی میکروفن و اتصال امن…');
    let stream: MediaStream | null = null;
    try {
      const config = await api<VoiceConfig>(`calls/${activeCall.callId}/voice/config`);
      if (config.role !== 'listener') throw new Error('invalid_voice_role');
      if (process.env.NODE_ENV === 'production' && !config.client.relayConfigured) throw new Error('voice_relay_not_ready');

      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (stream.getAudioTracks().length === 0) throw new DOMException('microphone_missing', 'NotFoundError');

      cleanupRtc();
      localStreamRef.current = stream;
      rtcCallIdRef.current = activeCall.callId;
      const pc = new RTCPeerConnection({ iceServers: config.client.iceServers });
      pcRef.current = pc;
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream!));

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
      };
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void api(`calls/${activeCall.callId}/voice/signals`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'ice', payload: event.candidate.toJSON() }),
        }).catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          void api(`calls/${activeCall.callId}/voice/signals`, {
            method: 'POST',
            body: JSON.stringify({ kind: 'reconnected', payload: { source: 'peer_connection_state' } }),
          }).catch(() => undefined);
          void markMediaConnected(activeCall.callId);
        }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          void api(`calls/${activeCall.callId}/voice/signals`, {
            method: 'POST',
            body: JSON.stringify({ kind: 'reconnecting', payload: { source: 'peer_connection_state' } }),
          }).catch(() => undefined);
        }
        if (pc.connectionState === 'disconnected') setNotice('اتصال ضعیف شده؛ در حال تلاش برای برگشت…');
        if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. پایان تماس را بزن و وضعیت را تازه کن.');
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') void markMediaConnected(activeCall.callId);
      };

      let signalResult: { status: string; signals: VoiceSignal[] } | null = null;
      let offer: VoiceSignal | undefined;
      for (let attempt = 0; attempt < 8 && !offer; attempt += 1) {
        signalResult = await api<{ status: string; signals: VoiceSignal[] }>(`calls/${activeCall.callId}/voice/signals`);
        offer = [...signalResult.signals].reverse().find((signal) => signal.senderRole === 'caller' && signal.kind === 'offer');
        if (!offer) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!offer || !signalResult) throw new Error('voice_offer_not_ready');

      await pc.setRemoteDescription(offer.payload as RTCSessionDescriptionInit);
      seenSignalsRef.current.add(offer.id);
      for (const signal of signalResult.signals) await consumeCallerSignal(activeCall.callId, pc, signal);
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api(`calls/${activeCall.callId}/voice/signals`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'answer', payload: { type: answer.type, sdp: answer.sdp } }),
      });
      setVoiceReady(true);
      setNotice('پاسخ تماس ثبت شد؛ اتصال صوتی در حال تکمیل است.');
      startSignalPolling(activeCall.callId, pc);
      await refreshActive().catch(() => undefined);
      stream = null;
    } catch (cause) {
      const browserErrorName = typeof DOMException !== 'undefined' && cause instanceof DOMException ? cause.name : '';
      if (stream && localStreamRef.current !== stream) stream.getTracks().forEach((track) => track.stop());
      cleanupRtc();
      if (browserErrorName === 'NotAllowedError' || browserErrorName === 'SecurityError') setError('برای پاسخ تماس باید دسترسی میکروفن را فعال کنی.');
      else if (browserErrorName === 'NotFoundError') setError('میکروفن قابل استفاده پیدا نشد.');
      else if (cause instanceof Error && cause.message === 'voice_offer_not_ready') setError('پیشنهاد صوتی Caller هنوز نرسیده است. وضعیت تماس را تازه کن و دوباره پاسخ بده.');
      else if (cause instanceof Error && cause.message === 'invalid_voice_role') setError('نقش این نشست برای پاسخ Listener معتبر نیست.');
      else setError(messageFor(cause instanceof Error ? cause.message : 'voice_failed'));
    } finally {
      setVoiceBusy(false);
    }
  }

  async function finishCall(kind: 'end' | 'safety-exit') {
    if (!activeCall || voiceBusy) return;
    setVoiceBusy(true);
    setError('');
    try {
      const result = await api<{ billableSeconds?: number; listenerEarningMinor?: string }>(`calls/${activeCall.callId}/voice/${kind}`, {
        method: 'POST',
        body: JSON.stringify(kind === 'safety-exit'
          ? { reason: 'web_listener_safety_exit', blockCounterparty: true }
          : { reason: 'web_listener_ended' }),
      });
      setNotice(kind === 'safety-exit'
        ? 'تماس برای ایمنی پایان یافت و طرف مقابل بلاک شد.'
        : result.billableSeconds === undefined
          ? 'پایان تماس ثبت شد.'
          : `پایان تماس ثبت شد؛ ${faNumber(result.billableSeconds)} ثانیه قابل محاسبه ثبت شده است.`);
      cleanupRtc();
      await Promise.all([refreshActive(), refreshRecentAndEarnings()]);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'end_failed'));
    } finally {
      setVoiceBusy(false);
    }
  }

  const isOnline = presence?.status === 'online';
  const isPaused = presence?.status === 'paused';
  const workControlsLocked = busy || activeCallConflict;
  const incomeAvailable = earnings.find((item) => item.status === 'available');

  return (
    <main className="listener-work-page">
      <header className="site-header">
        <a className="brand" href="/">یکی هست</a>
        <span>حالت کاری شنونده · Web/PWA</span>
      </header>

      <section className="listener-work-hero">
        <div>
          <p className="kicker">وضعیت کار</p>
          <h1>{activeCallConflict ? 'قفل ایمنی' : isOnline ? 'Online' : isPaused ? 'Pause' : 'Offline'}</h1>
        </div>
        <div className="work-status-copy">
          <p>
            این نسخه هنوز Push پس‌زمینه را آماده اعلام نمی‌کند. برای دریافت تماس باید این تب باز و فعال بماند؛
            با رفتن صفحه به پس‌زمینه، وضعیت به‌صورت fail-closed روی Offline می‌رود تا Caller به شنونده‌ای که اعلان نمی‌گیرد وصل نشود.
          </p>
          {incomeAvailable && <strong>درآمد قابل تسویه ثبت‌شده: {formatMoney(incomeAvailable.amountMinor, incomeAvailable.currencyCode)}</strong>}
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="helper" aria-live="polite">{notice}</p>}
      {activeCallConflict && (
        <p className="error">سرور بیش از یک تماس فعال برای این حساب گزارش کرده است. Online، Pause و تغییر گروه Caller قفل‌اند؛ Offline همچنان مجاز است.</p>
      )}

      <section className="work-grid">
        <div className="call-setup">
          <div>
            <p className="kicker">دریافت تماس</p>
            <h2>حضور و Callerهای قابل قبول</h2>
          </div>
          <div className="presence-pill" data-status={presence?.status ?? 'loading'}>
            {presence ? `${presence.status === 'online' ? '●' : presence.status === 'paused' ? '◐' : '○'} ${presence.status}` : 'در حال بررسی…'}
          </div>
          <div className="duration-options two-column">
            <button
              type="button"
              className={acceptsFemale ? 'selected' : ''}
              disabled={workControlsLocked}
              onClick={() => void toggleCallerPreference('female')}
            >
              Caller زن {acceptsFemale ? '✓' : ''}
            </button>
            <button
              type="button"
              className={acceptsMale ? 'selected' : ''}
              disabled={workControlsLocked}
              onClick={() => void toggleCallerPreference('male')}
            >
              Caller مرد {acceptsMale ? '✓' : ''}
            </button>
          </div>
          {!isOnline && !isPaused && (
            <button type="button" disabled={workControlsLocked || (!acceptsMale && !acceptsFemale)} onClick={() => void changePresence('online')}>
              {busy ? 'در حال ثبت…' : 'Online — آماده‌ام'}
            </button>
          )}
          {isOnline && (
            <button type="button" className="secondary-action" disabled={workControlsLocked} onClick={() => void changePresence('paused')}>
              Pause — تماس جدید نیاید
            </button>
          )}
          {isPaused && (
            <button type="button" disabled={workControlsLocked || (!acceptsMale && !acceptsFemale)} onClick={() => void changePresence('online')}>
              ادامه کار
            </button>
          )}
          {(isOnline || isPaused) && (
            <button type="button" className="secondary-action" disabled={busy} onClick={() => void changePresence('offline')}>
              Offline و پایان شیفت
            </button>
          )}
          <p className="helper">Heartbeat حضور فقط وقتی تب فعال باشد هر ۳۰ ثانیه ارسال می‌شود. Background Listener تا زمان آماده‌شدن اعلان واقعی باز نمی‌شود.</p>
        </div>

        <div className="call-setup">
          <div>
            <p className="kicker">تماس جاری</p>
            <h2>{activeCall ? activeStatusLabel(activeCall.status) : 'تماس فعالی نداری'}</h2>
          </div>
          {activeCall ? (
            <>
              <p className="helper">
                مسیر: {activeCall.transport === 'internet_voice' ? 'Internet Voice' : activeCall.transport ?? 'ثبت نشده'}
                {' · '}سقف: {activeCall.maxBillableSeconds ? `${faNumber(Math.floor(activeCall.maxBillableSeconds / 60))} دقیقه` : '—'}
              </p>
              {activeCall.status === 'calling_listener' && activeCall.transport === 'internet_voice' && !voiceReady && (
                <button type="button" disabled={voiceBusy} onClick={() => void answerInternetCall()}>
                  {voiceBusy ? 'در حال اتصال…' : 'پاسخ تماس اینترنتی'}
                </button>
              )}
              {activeCall.status === 'connected' && voiceReady && (
                <p className={warning ? 'error' : 'helper'}>زمان باقی‌مانده: {formatClock(remainingSeconds)}{warning ? ` · هشدار ${warning}` : ''}</p>
              )}
              {activeCall.status === 'connected' && !voiceReady && (
                <p className="error">سرور تماس را فعال می‌داند اما این تب اتصال WebRTC زنده ندارد. این صفحه اتصال جعلی نمی‌سازد؛ برای جلوگیری از وضعیت مبهم، تماس را پایان بده و دوباره شروع کن.</p>
              )}
              {activeCall.transport === 'internet_voice' && (
                <div className="duration-options two-column">
                  <button type="button" className="secondary-action" disabled={voiceBusy} onClick={() => void finishCall('end')}>پایان تماس</button>
                  <button type="button" className="danger-action" disabled={voiceBusy} onClick={() => void finishCall('safety-exit')}>خروج امن + بلاک</button>
                </div>
              )}
            </>
          ) : (
            <p className="helper">وقتی Online باشی و Caller تماس را شروع کند، درخواست اینجا دیده می‌شود. هویت، کشور و اطلاعات پرداخت Caller قبل از پذیرش نمایش داده نمی‌شود.</p>
          )}
          <button type="button" className="text-button" onClick={() => void refreshAll()}>به‌روزرسانی وضعیت</button>
          <audio ref={remoteAudioRef} autoPlay playsInline aria-label="صدای Caller" />
        </div>
      </section>

      <section className="call-setup wide-card" aria-labelledby="earnings-title">
        <div className="section-heading compact-heading">
          <div>
            <p className="kicker">درآمد</p>
            <h2 id="earnings-title">خلاصه درآمد ثبت‌شده</h2>
          </div>
          <button type="button" className="text-button" onClick={() => void refreshRecentAndEarnings()}>تازه‌سازی</button>
        </div>
        <div className="summary-grid">
          {earnings.map((item) => (
            <div className="summary-card" key={`${item.currencyCode}-${item.status}`}>
              <strong>{formatMoney(item.amountMinor, item.currencyCode)}</strong>
              <span>{item.status === 'available' ? 'قابل تسویه' : item.status === 'paid' ? 'پرداخت‌شده' : 'در انتظار'} · {faNumber(item.earningCount)} رکورد</span>
            </div>
          ))}
          {!earnings.length && <p className="helper">هنوز درآمدی برای این حساب ثبت نشده است.</p>}
        </div>
      </section>

      <section className="call-setup wide-card" aria-labelledby="recent-title">
        <p className="kicker">سابقه</p>
        <h2 id="recent-title">تماس‌های اخیر</h2>
        <div className="recent-list">
          {recentCalls.map((call) => (
            <div className="recent-row" key={call.callId}>
              <div>
                <strong>{recentStatusLabel(call.status)}</strong>
                <span>{new Date(call.endedAt ?? call.requestedAt).toLocaleString('fa-IR')}</span>
              </div>
              <div>
                <strong>{formatMoney(call.listenerEarningMinor, call.currencyCode)}</strong>
                <span>{faNumber(call.billableSeconds)} ثانیه قابل محاسبه</span>
              </div>
            </div>
          ))}
          {!recentCalls.length && <p className="helper">تماس پایان‌یافته‌ای ثبت نشده است.</p>}
        </div>
      </section>

      <nav className="public-links" aria-label="اطلاعات سرویس">
        <a href="/">خانه</a>
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
      </nav>
    </main>
  );
}
