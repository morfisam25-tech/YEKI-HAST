'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './work.css';

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
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  const fallbackCurrency = normalizedCurrency || 'ارز نامشخص';
  let minor: bigint;

  try {
    minor = BigInt(amountMinor);
  } catch {
    return `${amountMinor} ${fallbackCurrency} · واحد خرد ثبت‌شده`;
  }

  if (normalizedCurrency === 'IRR') {
    const toman = minor / BigInt(10);
    return `${new Intl.NumberFormat('fa-IR').format(toman)} تومان`;
  }

  try {
    const currencyFormatter = new Intl.NumberFormat('fa-IR', {
      style: 'currency',
      currency: normalizedCurrency,
      currencyDisplay: 'code',
    });
    const fractionDigits = currencyFormatter.resolvedOptions().maximumFractionDigits;
    const scale = BigInt(10) ** BigInt(fractionDigits);
    const negative = minor < BigInt(0);
    const absoluteMinor = negative ? -minor : minor;
    const major = absoluteMinor / scale;
    const fraction = absoluteMinor % scale;
    const majorFormatted = new Intl.NumberFormat('fa-IR', {
      useGrouping: true,
      maximumFractionDigits: 0,
    }).format(major);
    const fractionFormatted = fractionDigits === 0
      ? ''
      : `٫${fraction.toString().padStart(fractionDigits, '0').replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)])}`;
    const exactNumber = `${majorFormatted}${fractionFormatted}`;
    let insertedNumber = false;

    return currencyFormatter.formatToParts(negative ? -1 : 1).map((part) => {
      if (part.type === 'integer' || part.type === 'group' || part.type === 'decimal' || part.type === 'fraction') {
        if (insertedNumber) return '';
        insertedNumber = true;
        return exactNumber;
      }
      return part.value;
    }).join('');
  } catch {
    return `${amountMinor} ${fallbackCurrency} · واحد خرد ثبت‌شده`;
  }
}

function formatClock(seconds: number | null): string {
  if (seconds === null) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${faNumber(minutes)}:${rest.toLocaleString('fa-IR', { minimumIntegerDigits: 2, useGrouping: false })}`;
}

function presenceLabel(status: PresenceStatus): string {
  const labels: Record<PresenceStatus, string> = {
    online: 'آماده دریافت گفت‌وگو',
    paused: 'استراحت',
    offline: 'فعلاً در دسترس نیستم',
  };
  return labels[status];
}

function activeStatusLabel(status: ActiveCall['status']): string {
  const labels: Record<ActiveCall['status'], string> = {
    requested: 'گفت‌وگوی تازه در راه است',
    routing: 'در حال آماده‌سازی گفت‌وگو',
    calling_caller: 'در حال وصل‌شدن به کاربر',
    caller_answered: 'کاربر پاسخ داده؛ نوبت توست',
    calling_listener: 'گفت‌وگوی تازه منتظر پاسخ توست',
    connected: 'گفت‌وگو در جریان است',
  };
  return labels[status];
}

function recentStatusLabel(status: RecentCall['status']): string {
  const labels: Record<RecentCall['status'], string> = {
    completed: 'پایان عادی',
    missed: 'بی‌پاسخ',
    cancelled: 'لغوشده',
    failed: 'وصل نشد',
    safety_terminated: 'پایان برای ایمنی',
  };
  return labels[status];
}

function earningStatusLabel(status: EarningsSummary['status']): string {
  const labels: Record<EarningsSummary['status'], string> = {
    pending: 'ثبت‌شده',
    available: 'ثبت‌شده',
    paid: 'پرداخت‌شده',
  };
  return labels[status];
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'برای ورود به فضای شنونده، ابتدا وارد حساب خودت شو.',
    listener_not_approved: 'حساب شنونده هنوز برای دریافت گفت‌وگو فعال نشده است.',
    listener_verification_required: 'تأیید هویت شنونده هنوز کامل نشده است.',
    listener_not_online: 'حالت آماده دریافت گفت‌وگو غیرفعال شده است. دوباره آماده شو.',
    no_callers_accepted: 'برای آماده‌شدن، حداقل یکی از گروه‌های کاربران را انتخاب کن.',
    listener_active_call_conflict: 'برای این حساب چند گفت‌وگوی هم‌زمان ثبت شده است. تا روشن‌شدن وضعیت، دریافت گفت‌وگوی تازه متوقف می‌ماند.',
    call_not_internet_voice: 'این گفت‌وگو از این صفحه قابل پاسخ‌دادن نیست.',
    call_not_live: 'این گفت‌وگو دیگر فعال نیست.',
    call_not_found: 'این گفت‌وگو دیگر در دسترس نیست.',
    voice_relay_not_ready: 'اتصال صوتی هنوز آماده نیست. کمی بعد دوباره تلاش کن.',
    call_termination_in_progress: 'پایان این گفت‌وگو از جای دیگری شروع شده است.',
    backend_unavailable: 'ارتباط با سرویس برقرار نشد. دوباره تلاش کن.',
  };
  return messages[code] ?? 'این کار انجام نشد. دوباره تلاش کن.';
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
  const [attentionAnnouncement, setAttentionAnnouncement] = useState('');

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
  const announcedAttentionRef = useRef<string | null>(null);

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
    if (!activeCall || (activeCall.status !== 'caller_answered' && activeCall.status !== 'calling_listener')) {
      announcedAttentionRef.current = null;
      setAttentionAnnouncement('');
      return;
    }

    const announcementKey = `${activeCall.callId}:${activeCall.status}`;
    if (announcedAttentionRef.current === announcementKey) return;
    announcedAttentionRef.current = announcementKey;
    setAttentionAnnouncement(activeStatusLabel(activeCall.status));
  }, [activeCall?.callId, activeCall?.status]);

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
          setNotice(result.capReached ? 'زمان این گفت‌وگو به سقف مجاز رسید و گفت‌وگو پایان یافت.' : 'گفت‌وگو پایان یافت.');
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
        ? 'آماده دریافت گفت‌وگو هستی. برای دریافت درخواست تازه، این صفحه را باز و فعال نگه دار.'
        : result.status === 'paused'
          ? 'در حالت استراحتی. گفت‌وگوی تازه برایت ارسال نمی‌شود.'
          : 'فعلاً در دسترس نیستی و گفت‌وگوی تازه برایت ارسال نمی‌شود.');
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
        ? 'گفت‌وگو وصل شد. زمان گفت‌وگو از همین لحظه محاسبه می‌شود.'
        : 'صدای تو آماده است؛ در حال وصل‌شدن به کاربر…');
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
          setNotice('گفت‌وگو پایان یافت.');
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
    setNotice('در حال آماده‌سازی میکروفن…');
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
        if (pc.connectionState === 'disconnected') setNotice('اتصال کمی ناپایدار شده؛ در حال بازیابی…');
        if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. گفت‌وگو را پایان بده و وضعیت را تازه کن.');
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
      setNotice('پاسخ ثبت شد؛ در حال وصل‌شدن…');
      startSignalPolling(activeCall.callId, pc);
      await refreshActive().catch(() => undefined);
      stream = null;
    } catch (cause) {
      const browserErrorName = typeof DOMException !== 'undefined' && cause instanceof DOMException ? cause.name : '';
      if (stream && localStreamRef.current !== stream) stream.getTracks().forEach((track) => track.stop());
      cleanupRtc();
      if (browserErrorName === 'NotAllowedError' || browserErrorName === 'SecurityError') setError('برای پاسخ به گفت‌وگو، دسترسی میکروفن را فعال کن.');
      else if (browserErrorName === 'NotFoundError') setError('میکروفن قابل استفاده پیدا نشد.');
      else if (cause instanceof Error && cause.message === 'voice_offer_not_ready') setError('اتصال صوتی هنوز آماده پاسخ نیست. وضعیت را تازه کن و دوباره پاسخ بده.');
      else if (cause instanceof Error && cause.message === 'invalid_voice_role') setError('این گفت‌وگو در این صفحه قابل پاسخ‌دادن نیست.');
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
        ? 'گفت‌وگو برای ایمنی پایان یافت و این کاربر مسدود شد.'
        : result.billableSeconds === undefined
          ? 'گفت‌وگو پایان یافت.'
          : `گفت‌وگو پایان یافت؛ ${faNumber(result.billableSeconds)} ثانیه زمان قابل محاسبه ثبت شد.`);
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

  return (
    <main className="listener-work-page">
      <header className="listener-work-header">
        <a className="listener-work-brand" href="/">یکی هست</a>
        <span>فضای شنونده</span>
      </header>

      <div className="listener-sr-only" aria-live="assertive" aria-atomic="true">
        {attentionAnnouncement}
      </div>

      <section className="listener-work-hero" aria-labelledby="listener-work-title">
        <div className="listener-work-hero-status">
          <p className="listener-kicker">وضعیت تو</p>
          <h1 id="listener-work-title">
            {activeCallConflict
              ? 'دریافت گفت‌وگوی تازه موقتاً متوقف است'
              : presence
                ? presenceLabel(presence.status)
                : 'در حال بررسی وضعیت…'}
          </h1>
        </div>
        <div className="listener-work-status-copy">
          <p>
            برای دریافت گفت‌وگوی تازه، این صفحه باید باز و فعال بماند. اگر صفحه غیرفعال شود، وضعیت تو به‌طور خودکار از حالت آماده خارج می‌شود تا گفت‌وگوی بی‌پاسخ نماند.
          </p>
        </div>
      </section>

      <div className="listener-feedback" aria-live="polite">
        {error && <p className="listener-alert listener-alert-error" role="alert">{error}</p>}
        {notice && <p className="listener-alert listener-alert-notice">{notice}</p>}
        {activeCallConflict && (
          <p className="listener-alert listener-alert-error">
            تا زمانی که وضعیت گفت‌وگوهای هم‌زمان روشن شود، فقط می‌توانی خودت را از دسترس خارج کنی. دریافت گفت‌وگوی تازه و تغییر گروه کاربران موقتاً بسته است.
          </p>
        )}
      </div>

      <section className="listener-work-grid">
        <article className="listener-card listener-presence-card">
          <div className="listener-card-heading">
            <div>
              <p className="listener-kicker">آمادگی</p>
              <h2>چه کسانی می‌توانند با تو گفت‌وگو کنند؟</h2>
            </div>
            <div className="listener-presence-pill" data-status={presence?.status ?? 'loading'}>
              {presence ? presenceLabel(presence.status) : 'در حال بررسی…'}
            </div>
          </div>

          <p className="listener-helper">گروه‌هایی را انتخاب کن که در حال حاضر با گفت‌وگو با آن‌ها راحتی.</p>

          <div className="listener-choice-grid" aria-label="ترجیح کاربران">
            <button
              type="button"
              className={`listener-choice ${acceptsFemale ? 'is-selected' : ''}`}
              aria-pressed={acceptsFemale}
              disabled={workControlsLocked}
              onClick={() => void toggleCallerPreference('female')}
            >
              <span>کاربران زن</span>
              <span aria-hidden="true">{acceptsFemale ? '✓' : ''}</span>
            </button>
            <button
              type="button"
              className={`listener-choice ${acceptsMale ? 'is-selected' : ''}`}
              aria-pressed={acceptsMale}
              disabled={workControlsLocked}
              onClick={() => void toggleCallerPreference('male')}
            >
              <span>کاربران مرد</span>
              <span aria-hidden="true">{acceptsMale ? '✓' : ''}</span>
            </button>
          </div>

          <div className="listener-presence-actions">
            {!isOnline && !isPaused && (
              <button
                type="button"
                className="listener-primary-action"
                disabled={workControlsLocked || (!acceptsMale && !acceptsFemale)}
                onClick={() => void changePresence('online')}
              >
                {busy ? 'در حال ثبت…' : 'آماده دریافت گفت‌وگو'}
              </button>
            )}
            {isOnline && (
              <button
                type="button"
                className="listener-secondary-action"
                disabled={workControlsLocked}
                onClick={() => void changePresence('paused')}
              >
                استراحت
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                className="listener-primary-action"
                disabled={workControlsLocked || (!acceptsMale && !acceptsFemale)}
                onClick={() => void changePresence('online')}
              >
                دوباره آماده‌ام
              </button>
            )}
            {(isOnline || isPaused) && (
              <button
                type="button"
                className="listener-quiet-action"
                disabled={busy}
                onClick={() => void changePresence('offline')}
              >
                فعلاً در دسترس نیستم
              </button>
            )}
          </div>

          <p className="listener-self-care">اگر چند دقیقه فاصله لازم داری، «استراحت» را انتخاب کن. برگشتن هر وقت آماده بودی کافی است.</p>
        </article>

        <article className="listener-card listener-call-card">
          <div className="listener-card-heading">
            <div>
              <p className="listener-kicker">گفت‌وگوی جاری</p>
              <h2>{activeCall ? activeStatusLabel(activeCall.status) : 'فعلاً گفت‌وگوی فعالی نداری'}</h2>
            </div>
            {activeCall && <span className="listener-live-dot" aria-label="گفت‌وگوی فعال" />}
          </div>

          {activeCall ? (
            <>
              {activeCall.maxBillableSeconds && (
                <p className="listener-helper">
                  حداکثر زمان این گفت‌وگو: {faNumber(Math.floor(activeCall.maxBillableSeconds / 60))} دقیقه
                </p>
              )}

              {activeCall.status === 'calling_listener' && activeCall.transport === 'internet_voice' && !voiceReady && (
                <button
                  type="button"
                  className="listener-primary-action listener-answer-action"
                  disabled={voiceBusy}
                  onClick={() => void answerInternetCall()}
                >
                  {voiceBusy ? 'در حال آماده‌شدن…' : 'پاسخ به گفت‌وگو'}
                </button>
              )}

              {activeCall.status === 'connected' && voiceReady && (
                <div className={`listener-timer ${warning ? 'has-warning' : ''}`}>
                  <span>زمان باقی‌مانده</span>
                  <strong>{formatClock(remainingSeconds)}</strong>
                  {warning && <small>زمان گفت‌وگو رو به پایان است.</small>}
                </div>
              )}

              {activeCall.status === 'connected' && !voiceReady && (
                <p className="listener-alert listener-alert-error">
                  صدای زنده این گفت‌وگو در این صفحه در دسترس نیست. برای جلوگیری از وضعیت مبهم، گفت‌وگو را پایان بده و بعد وضعیت را تازه کن.
                </p>
              )}

              {activeCall.transport === 'internet_voice' && (
                <div className="listener-call-actions">
                  <button
                    type="button"
                    className="listener-secondary-action"
                    disabled={voiceBusy}
                    onClick={() => void finishCall('end')}
                  >
                    پایان گفت‌وگو
                  </button>
                  <button
                    type="button"
                    className="listener-danger-action"
                    disabled={voiceBusy}
                    onClick={() => void finishCall('safety-exit')}
                  >
                    خروج برای ایمنی و مسدودکردن
                  </button>
                </div>
              )}

              {activeCall.transport === 'internet_voice' && (
                <p className="listener-safety-note">
                  «پایان گفت‌وگو» پایان عادی است. گزینه ایمنی گفت‌وگو را تمام می‌کند و همان کاربر را مسدود می‌کند.
                </p>
              )}
            </>
          ) : (
            <p className="listener-helper listener-empty-copy">
              وقتی آماده باشی، درخواست تازه همین‌جا ظاهر می‌شود.
            </p>
          )}

          <button type="button" className="listener-text-action" onClick={() => void refreshAll()}>
            تازه‌کردن وضعیت
          </button>
          <audio ref={remoteAudioRef} autoPlay playsInline aria-label="صدای کاربر" />
        </article>
      </section>

      <section className="listener-card listener-wide-card" aria-labelledby="earnings-title">
        <div className="listener-section-heading">
          <div>
            <p className="listener-kicker">سوابق مالی</p>
            <h2 id="earnings-title">مبالغ ثبت‌شده برای گفت‌وگوها</h2>
          </div>
          <button type="button" className="listener-text-action" onClick={() => void refreshRecentAndEarnings()}>
            تازه‌سازی
          </button>
        </div>
        <p className="listener-helper listener-finance-note">
          این بخش فقط رکوردهای مالی ثبت‌شده در سامانه را نشان می‌دهد. از این وضعیت‌ها نمی‌توان زمان پرداخت، امکان برداشت یا تسویه را نتیجه گرفت.
        </p>
        <div className="listener-summary-grid">
          {earnings.map((item) => (
            <div className="listener-summary-card" key={`${item.currencyCode}-${item.status}`}>
              <strong>{formatMoney(item.amountMinor, item.currencyCode)}</strong>
              <span>{earningStatusLabel(item.status)} · {faNumber(item.earningCount)} رکورد</span>
            </div>
          ))}
          {!earnings.length && <p className="listener-helper">هنوز مبلغی برای این حساب ثبت نشده است.</p>}
        </div>
      </section>

      <section className="listener-card listener-wide-card" aria-labelledby="recent-title">
        <div className="listener-section-heading">
          <div>
            <p className="listener-kicker">سابقه</p>
            <h2 id="recent-title">گفت‌وگوهای اخیر</h2>
          </div>
        </div>
        <div className="listener-recent-list">
          {recentCalls.map((call) => (
            <div className="listener-recent-row" key={call.callId}>
              <div>
                <strong>{recentStatusLabel(call.status)}</strong>
                <span>{new Date(call.endedAt ?? call.requestedAt).toLocaleString('fa-IR')}</span>
              </div>
              <div className="listener-recent-amount">
                <strong>{formatMoney(call.listenerEarningMinor, call.currencyCode)}</strong>
                <span>مبلغ ثبت‌شده · {faNumber(call.billableSeconds)} ثانیه زمان قابل محاسبه</span>
              </div>
            </div>
          ))}
          {!recentCalls.length && <p className="listener-helper">هنوز گفت‌وگوی پایان‌یافته‌ای ثبت نشده است.</p>}
        </div>
      </section>

      <nav className="listener-public-links" aria-label="اطلاعات سرویس">
        <a href="/">خانه</a>
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
      </nav>
    </main>
  );
}
