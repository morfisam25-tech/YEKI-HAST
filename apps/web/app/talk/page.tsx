'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './talk.module.css';

type Language = { code: string; nameFa: string; nameEn?: string | null; proficiency: string };
type Listener = {
  id: string;
  nickname: string;
  gender: 'female' | 'male';
  verified: boolean;
  reliabilityScore: number;
  shortIntro: string | null;
  listeningStyle: string | null;
  completedCalls: number;
  ratingAverage: number | null;
  ratingCount: number;
  presence: string;
  languages: Language[];
};

type VoiceSignal = {
  id: string;
  kind: 'offer' | 'answer' | 'ice' | 'media_connected' | 'reconnecting' | 'reconnected';
  senderRole: 'caller' | 'listener';
  payload: unknown;
};

type CallPhase = 'idle' | 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';
type GenderFilter = 'any' | 'female' | 'male';
type VoiceStart = {
  noAnswerSeconds: number;
  client: { iceServers: RTCIceServer[]; relayConfigured: boolean };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/caller/${path}`, {
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

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const secondPart = new Intl.NumberFormat('fa-IR', {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(rest);
  return `${faNumber(minutes)}:${secondPart}`;
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'برای تماس ابتدا از صفحه اصلی وارد حساب شو.',
    caller_closed_beta: 'این بخش هنوز برای استفاده عمومی فعال نشده است.',
    caller_closed_beta_disabled: 'این بخش هنوز برای استفاده عمومی فعال نشده است.',
    caller_age_policy_not_configured: 'شرایط سنی این بخش هنوز آماده نشده است.',
    caller_age_gate_required: 'برای ادامه باید شرایط سنی سرویس را تأیید کنی.',
    caller_consent_required: 'برای ادامه باید قواعد گفت‌وگو و مرزهای ایمنی را بپذیری.',
    no_listener_available: 'این شنونده دیگر در دسترس نیست. یک نفر دیگر را انتخاب کن.',
    insufficient_balance: 'اعتبار برای سقف زمانی انتخاب‌شده کافی نیست.',
    insufficient_balance_for_extension: 'اعتبار برای این تمدید کافی نیست.',
    call_transport_not_configured: 'مسیر امن صدا در این محیط هنوز آماده نیست.',
    voice_relay_not_ready: 'مسیر امن صدا در این محیط هنوز آماده نیست.',
    caller_call_already_active: 'یک تماس فعال از قبل وجود دارد.',
  };
  return messages[code] ?? 'این کار انجام نشد. دوباره تلاش کن.';
}

function mergeLanguages(current: Language[], listeners: Listener[]): Language[] {
  const byCode = new Map(current.map((item) => [item.code, item]));
  for (const listener of listeners) {
    for (const language of listener.languages) byCode.set(language.code, language);
  }
  return [...byCode.values()].sort((a, b) => (a.nameFa || a.code).localeCompare(b.nameFa || b.code, 'fa'));
}

export default function TalkPage() {
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [knownLanguages, setKnownLanguages] = useState<Language[]>([]);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('any');
  const [languageFilter, setLanguageFilter] = useState('any');
  const [selected, setSelected] = useState<Listener | null>(null);
  const [callLanguageCode, setCallLanguageCode] = useState('fa');
  const [capSeconds, setCapSeconds] = useState<600 | 1800 | 3600>(1800);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [maxBillableSeconds, setMaxBillableSeconds] = useState<number>(capSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [warning, setWarning] = useState<60 | 120 | null>(null);
  const [connectionUnstable, setConnectionUnstable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noAnswerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenSignalsRef = useRef(new Set<string>());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const mediaConnectedSentRef = useRef(false);

  const policiesReady = ageConfirmed && termsAccepted && safetyAccepted;

  const phaseText = useMemo(() => {
    if (connectionUnstable && phase === 'connected') return 'اتصال ناپایدار است؛ در حال تلاش برای برگشت صدا…';
    if (phase === 'preparing') return 'در حال آماده‌کردن میکروفن…';
    if (phase === 'ringing') return 'در حال زنگ‌زدن به شنونده…';
    if (phase === 'connecting') return 'شنونده پاسخ داده؛ صدا در حال وصل‌شدن است…';
    if (phase === 'connected') return 'تماس وصل است.';
    if (phase === 'ended') return 'تماس پایان یافته است.';
    return 'آماده شروع';
  }, [connectionUnstable, phase]);

  const cleanupRtc = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (noAnswerRef.current) clearTimeout(noAnswerRef.current);
    pollRef.current = null;
    noAnswerRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    seenSignalsRef.current.clear();
    pendingCandidatesRef.current = [];
    mediaConnectedSentRef.current = false;
    setConnectionUnstable(false);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const refreshMarketplace = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ online: 'true', limit: '30' });
      if (genderFilter !== 'any') params.set('gender', genderFilter);
      if (languageFilter !== 'any') params.set('language', languageFilter);
      const result = await api<{ listeners: Listener[] }>(`listeners?${params.toString()}`);
      setListeners(result.listeners);
      setKnownLanguages((current) => mergeLanguages(current, result.listeners));
      setSelected((current) => current && result.listeners.some((item) => item.id === current.id) ? current : null);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'load_failed'));
    }
  }, [genderFilter, languageFilter]);

  useEffect(() => {
    void refreshMarketplace();
  }, [refreshMarketplace]);

  useEffect(() => cleanupRtc, [cleanupRtc]);

  useEffect(() => {
    if (phase !== 'connected' || !connectedAt) {
      setRemainingSeconds(null);
      setWarning(null);
      return;
    }
    const update = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(connectedAt)) / 1000));
      const remaining = Math.max(0, maxBillableSeconds - elapsed);
      setRemainingSeconds(remaining);
      setWarning(remaining <= 60 ? 60 : remaining <= 120 ? 120 : null);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [connectedAt, maxBillableSeconds, phase]);

  useEffect(() => {
    if (phase !== 'connected' || !callId) return;
    let active = true;
    let running = false;
    const heartbeat = async () => {
      if (!active || running || pcRef.current?.connectionState !== 'connected') return;
      running = true;
      try {
        const result = await api<{
          status: string;
          terminal: boolean;
          capReached: boolean;
          timing: { remainingSeconds: number | null; warning: 60 | 120 | null };
        }>(`calls/${callId}/voice/heartbeat`, { method: 'POST', body: '{}' });
        if (!active) return;
        if (result.timing.remainingSeconds !== null) setRemainingSeconds(result.timing.remainingSeconds);
        setWarning(result.timing.warning);
        if (result.terminal) {
          setPhase('ended');
          setRemainingSeconds(0);
          setWarning(null);
          setNotice(result.capReached ? 'زمان انتخاب‌شده تمام شد و تماس پایان یافت.' : 'تماس پایان یافت.');
          cleanupRtc();
          void refreshMarketplace();
        }
      } catch {
        // The server remains authoritative for timing; retry on the next heartbeat.
      } finally {
        running = false;
      }
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [callId, cleanupRtc, phase, refreshMarketplace]);

  const syncCallTiming = useCallback(async (id: string) => {
    const details = await api<{ status: string; connectedAt: string | null; maxBillableSeconds: number | null }>(`calls/${id}`);
    if (details.connectedAt) setConnectedAt(details.connectedAt);
    if (details.maxBillableSeconds) setMaxBillableSeconds(details.maxBillableSeconds);
    return details.status;
  }, []);

  const beginRtc = useCallback(async (id: string, voice: VoiceStart, stream: MediaStream) => {
    cleanupRtc();
    localStreamRef.current = stream;
    setPhase('ringing');
    setNotice('در حال تماس با شنونده…');

    const pc = new RTCPeerConnection({ iceServers: voice.client.iceServers });
    pcRef.current = pc;
    stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream && remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void api(`calls/${id}/voice/signals`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'ice', payload: event.candidate.toJSON() }),
      }).catch(() => undefined);
    };

    const markMediaConnected = async () => {
      if (mediaConnectedSentRef.current) return;
      mediaConnectedSentRef.current = true;
      try {
        const result = await api<{ status: string }>(`calls/${id}/voice/signals`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'media_connected', payload: { source: 'web_rtc' } }),
        });
        if (result.status === 'connected') {
          if (noAnswerRef.current) clearTimeout(noAnswerRef.current);
          setConnectionUnstable(false);
          setPhase('connected');
          setNotice('تماس وصل شد. هزینه فقط از زمان اتصال واقعی محاسبه می‌شود.');
          await syncCallTiming(id);
        }
      } catch {
        mediaConnectedSentRef.current = false;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectionUnstable(false);
        void api(`calls/${id}/voice/signals`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'reconnected', payload: { source: 'peer_connection_state' } }),
        }).catch(() => undefined);
        void markMediaConnected();
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionUnstable(true);
        void api(`calls/${id}/voice/signals`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'reconnecting', payload: { source: 'peer_connection_state' } }),
        }).catch(() => undefined);
      }
      if (pc.connectionState === 'disconnected') setNotice('اتصال ناپایدار شده؛ در حال تلاش برای برگشت صدا…');
      if (pc.connectionState === 'failed') setError('اتصال صدا قطع شد. می‌توانی تماس را پایان بدهی و دوباره تلاش کنی.');
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') void markMediaConnected();
    };

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await api(`calls/${id}/voice/signals`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'offer', payload: { type: offer.type, sdp: offer.sdp } }),
    });

    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await api<{ status: string; signals: VoiceSignal[] }>(`calls/${id}/voice/signals`);
        for (const signal of result.signals) {
          if (signal.senderRole !== 'listener' || seenSignalsRef.current.has(signal.id)) continue;
          seenSignalsRef.current.add(signal.id);
          if (signal.kind === 'answer') {
            const description = signal.payload as RTCSessionDescriptionInit;
            if (!pc.remoteDescription) {
              await pc.setRemoteDescription(description);
              for (const candidate of pendingCandidatesRef.current.splice(0)) {
                await pc.addIceCandidate(candidate).catch(() => undefined);
              }
              setPhase('connecting');
              setNotice('شنونده پاسخ داد؛ در حال وصل‌کردن صدا…');
            }
          } else if (signal.kind === 'ice') {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
            else pendingCandidatesRef.current.push(candidate);
          }
        }
        if (result.status === 'connected') {
          if (noAnswerRef.current) clearTimeout(noAnswerRef.current);
          setConnectionUnstable(false);
          setPhase('connected');
          setNotice('تماس وصل شد. هزینه فقط از زمان اتصال واقعی محاسبه می‌شود.');
          await syncCallTiming(id);
        } else if (result.status === 'missed') {
          setPhase('ended');
          setNotice('شنونده پاسخ نداد. مبلغی از اعتبار کم نشده است.');
          cleanupRtc();
          void refreshMarketplace();
        }
      } finally {
        polling = false;
      }
    };
    pollRef.current = setInterval(() => void poll().catch(() => undefined), 900);
    void poll().catch(() => undefined);

    noAnswerRef.current = setTimeout(() => {
      void api<{ status: string }>(`calls/${id}/voice/no-answer`, { method: 'POST', body: '{}' })
        .then(() => {
          setPhase('ended');
          setNotice('شنونده پاسخ نداد. مبلغی از اعتبار کم نشده است.');
          cleanupRtc();
          void refreshMarketplace();
        })
        .catch(() => undefined);
    }, Math.max(1, voice.noAnswerSeconds) * 1000);
  }, [cleanupRtc, refreshMarketplace, syncCallTiming]);

  function chooseListener(listener: Listener) {
    setSelected(listener);
    const preferred = listener.languages.find((item) => item.code === languageFilter)
      ?? listener.languages.find((item) => item.code === 'fa')
      ?? listener.languages[0];
    setCallLanguageCode(preferred?.code ?? 'fa');
    setError('');
  }

  async function startCall() {
    if (!selected || busy || !policiesReady) return;
    setBusy(true);
    setPhase('preparing');
    setError('');
    setNotice('در حال آماده‌کردن میکروفن…');

    let preparedStream: MediaStream | null = null;
    let createdCallId: string | null = null;
    let voiceStarted = false;
    try {
      await api('caller/age-gate', {
        method: 'POST',
        body: JSON.stringify({ confirmed: true, termsAccepted: true, safetyAccepted: true }),
      });

      preparedStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (preparedStream.getAudioTracks().length === 0) throw new DOMException('microphone_missing', 'NotFoundError');

      const call = await api<{ callId: string; maxBillableSeconds: number }>('calls/request', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: `web-${crypto.randomUUID()}`,
          listenerId: selected.id,
          listenerGender: 'any',
          languageCode: callLanguageCode,
          maxSeconds: capSeconds,
        }),
      });
      createdCallId = call.callId;
      setCallId(call.callId);
      setMaxBillableSeconds(call.maxBillableSeconds ?? capSeconds);

      const voice = await api<VoiceStart>(`calls/${call.callId}/voice/start`, { method: 'POST', body: '{}' });
      voiceStarted = true;
      if (!voice.client.relayConfigured && process.env.NODE_ENV === 'production') throw new Error('voice_relay_not_ready');
      await beginRtc(call.callId, voice, preparedStream);
      preparedStream = null;
    } catch (cause) {
      if (createdCallId) {
        const path = voiceStarted ? `calls/${createdCallId}/voice/end` : `calls/${createdCallId}/cancel`;
        const reason = voiceStarted ? 'web_start_failed' : 'web_pre_voice_start_failed';
        await api(path, { method: 'POST', body: JSON.stringify({ reason }) }).catch(() => undefined);
      }
      if (preparedStream && localStreamRef.current !== preparedStream) preparedStream.getTracks().forEach((track) => track.stop());
      cleanupRtc();
      setCallId(null);
      setPhase('idle');
      const code = cause instanceof Error ? cause.message : 'call_failed';
      const browserErrorName = typeof DOMException !== 'undefined' && cause instanceof DOMException ? cause.name : '';
      if (browserErrorName === 'NotAllowedError' || browserErrorName === 'SecurityError') setError('برای تماس باید دسترسی میکروفن را فعال کنی.');
      else if (browserErrorName === 'NotFoundError') setError('میکروفن قابل استفاده پیدا نشد.');
      else setError(messageFor(code));
    } finally {
      setBusy(false);
    }
  }

  async function extend(minutes: 15 | 30) {
    if (!callId || phase !== 'connected' || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ maxBillableSeconds: number }>(`calls/${callId}/voice/extend`, {
        method: 'POST',
        body: JSON.stringify({ extensionMinutes: minutes, clientRequestId: `web-${crypto.randomUUID()}` }),
      });
      setMaxBillableSeconds(result.maxBillableSeconds);
      setNotice(`${faNumber(minutes)} دقیقه به زمان تماس اضافه شد.`);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'extend_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function finish(path: 'end' | 'safety-exit') {
    if (!callId || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = path === 'safety-exit'
        ? { reason: 'web_safety_exit', blockCounterparty: true }
        : { reason: 'web_caller_ended' };
      const result = await api<{ billableSeconds?: number }>(`calls/${callId}/voice/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNotice(path === 'safety-exit'
        ? 'تماس فوراً پایان یافت و این شنونده برای تو مسدود شد.'
        : result.billableSeconds === undefined
          ? 'تماس پایان یافت.'
          : `تماس پایان یافت. مدت قابل محاسبه: ${faNumber(result.billableSeconds)} ثانیه.`);
      setPhase('ended');
      cleanupRtc();
      await refreshMarketplace();
    } catch {
      setError('پایان تماس تأیید نشد. دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.brand} href="/">یکی هست</a>
          <div>
            <p className={styles.eyebrow}>گفت‌وگو با یک آدم واقعی</p>
            <h1 className={styles.title}>یک شنونده انتخاب کن و حرف بزن</h1>
            <p className={styles.lead}>اگر شنونده پاسخ ندهد، مبلغی از اعتبار کم نمی‌شود. هزینه فقط از زمان اتصال واقعی محاسبه می‌شود.</p>
          </div>
          <nav className={styles.nav} aria-label="مسیرهای گفت‌وگو">
            <a href="/booking">رزرو برای بعد</a>
            <a href="/">صفحه اصلی</a>
          </nav>
        </header>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {notice && <div className={styles.notice} aria-live="polite">{notice}</div>}

        {(phase === 'idle' || phase === 'ended') ? (
          <>
            <section className={styles.section} aria-labelledby="listeners-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>الان در دسترس</p>
                  <h2 id="listeners-title" className={styles.heading}>شنونده مناسب خودت را پیدا کن</h2>
                </div>
                <button type="button" className={styles.textButton} disabled={busy} onClick={() => void refreshMarketplace()}>به‌روزرسانی</button>
              </div>

              <div className={styles.filters} aria-label="فیلتر شنونده‌ها">
                <label className={styles.field}>
                  <span>زبان گفت‌وگو</span>
                  <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
                    <option value="any">همه زبان‌ها</option>
                    {knownLanguages.map((language) => (
                      <option key={language.code} value={language.code}>{language.nameFa || language.nameEn || language.code}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>جنسیت شنونده</span>
                  <select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value as GenderFilter)}>
                    <option value="any">فرقی ندارد</option>
                    <option value="female">زن</option>
                    <option value="male">مرد</option>
                  </select>
                </label>
              </div>

              <div className={styles.listenerGrid}>
                {listeners.map((listener) => (
                  <button
                    type="button"
                    key={listener.id}
                    className={`${styles.listenerCard} ${selected?.id === listener.id ? styles.listenerSelected : ''}`}
                    onClick={() => chooseListener(listener)}
                  >
                    <span className={styles.listenerTopline}>
                      <strong>{listener.nickname}</strong>
                      {listener.verified && <span className={styles.verified}>هویت تأیید شده</span>}
                    </span>
                    <span className={styles.languageList}>
                      {listener.languages.map((language) => language.nameFa || language.nameEn || language.code).join(' · ')}
                    </span>
                    <span className={styles.listenerStats}>
                      {listener.ratingAverage === null
                        ? 'هنوز امتیازی ثبت نشده'
                        : `امتیاز ${listener.ratingAverage.toFixed(1)} از ۵ · ${faNumber(listener.ratingCount)} نظر`}
                      {listener.completedCalls > 0 ? ` · ${faNumber(listener.completedCalls)} گفت‌وگوی انجام‌شده` : ''}
                    </span>
                    {listener.listeningStyle && <span className={styles.listeningStyle}>شیوه شنیدن: {listener.listeningStyle}</span>}
                    {listener.shortIntro && (
                      <span className={styles.intro}>
                        {listener.shortIntro}
                        <small>این معرفی را خود شنونده نوشته است.</small>
                      </span>
                    )}
                  </button>
                ))}
                {!listeners.length && !error && <p className={styles.empty}>الان شنونده‌ای با این انتخاب‌ها در دسترس نیست.</p>}
              </div>
            </section>

            {selected && (
              <section className={styles.section} aria-labelledby="call-title">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.eyebrow}>تماس با {selected.nickname}</p>
                    <h2 id="call-title" className={styles.heading}>قبل از تماس</h2>
                  </div>
                </div>

                <div className={styles.setupGrid}>
                  <div className={styles.choiceBlock}>
                    <span className={styles.label}>مدت تماس</span>
                    <div className={styles.choiceRow}>
                      {([600, 1800, 3600] as const).map((seconds) => (
                        <button
                          type="button"
                          key={seconds}
                          aria-pressed={capSeconds === seconds}
                          className={`${styles.choice} ${capSeconds === seconds ? styles.choiceActive : ''}`}
                          onClick={() => setCapSeconds(seconds)}
                        >
                          {faNumber(seconds / 60)} دقیقه
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className={styles.field}>
                    <span>زبان تماس</span>
                    <select value={callLanguageCode} onChange={(event) => setCallLanguageCode(event.target.value)}>
                      {selected.languages.map((language) => (
                        <option key={language.code} value={language.code}>{language.nameFa || language.nameEn || language.code}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={styles.trustNote}>
                  <strong>قبل از اتصال هزینه‌ای محاسبه نمی‌شود.</strong>
                  <span>اگر شنونده پاسخ ندهد، مبلغی از اعتبار کم نمی‌شود.</span>
                </div>

                <div className={styles.consent}>
                  <p>این سرویس برای شنیده‌شدن و گفت‌وگوی محترمانه است؛ جای اورژانس یا خدمات تخصصی پزشکی، روان‌شناسی و حقوقی نیست. اطلاعات تماس شخصی هم نباید ردوبدل شود.</p>
                  <label>
                    <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />
                    <span>تأیید می‌کنم شرایط سنی استفاده از سرویس را دارم.</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                    <span><a href="/terms">قواعد استفاده</a> را خوانده‌ام و می‌پذیرم.</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={safetyAccepted} onChange={(event) => setSafetyAccepted(event.target.checked)} />
                    <span>مرزهای ایمنی، احترام و عدم تبادل اطلاعات تماس شخصی را می‌پذیرم.</span>
                  </label>
                </div>

                <button type="button" className={styles.primary} disabled={!policiesReady || busy} onClick={() => void startCall()}>
                  {busy ? 'در حال آماده‌کردن…' : `تماس با ${selected.nickname}`}
                </button>
                {!policiesReady && <p className={styles.helper}>برای شروع تماس، سه تأیید بالا لازم است.</p>}
              </section>
            )}
          </>
        ) : (
          <section className={styles.liveCard} aria-labelledby="live-call-title">
            <p className={styles.eyebrow}>گفت‌وگو با</p>
            <h2 id="live-call-title" className={styles.liveName}>{selected?.nickname ?? 'شنونده'}</h2>
            <div className={`${styles.liveState} ${connectionUnstable ? styles.liveStateWarning : ''}`}>{phaseText}</div>

            {phase === 'connected' && remainingSeconds !== null && (
              <div className={`${styles.timeCard} ${warning ? styles.timeWarning : ''}`}>
                <span>زمان باقی‌مانده</span>
                <strong>{formatRemaining(remainingSeconds)}</strong>
                {warning === 120 && <small>حدود ۲ دقیقه مانده</small>}
                {warning === 60 && <small>حدود ۱ دقیقه مانده</small>}
              </div>
            )}

            {phase === 'connected' && (
              <div className={styles.choiceRow} aria-label="تمدید تماس">
                <button type="button" className={styles.secondary} disabled={busy} onClick={() => void extend(15)}>۱۵ دقیقه بیشتر</button>
                <button type="button" className={styles.secondary} disabled={busy} onClick={() => void extend(30)}>۳۰ دقیقه بیشتر</button>
              </div>
            )}

            {callId && (
              <div className={styles.callActions}>
                <button type="button" className={styles.endButton} disabled={busy} onClick={() => void finish('end')}>پایان تماس</button>
                <button type="button" className={styles.safetyButton} disabled={busy} onClick={() => void finish('safety-exit')}>خروج فوری و مسدودکردن</button>
              </div>
            )}
            <p className={styles.safetyHint}>اگر در تماس احساس ناامنی کردی، خروج فوری تماس را قطع می‌کند و این شنونده را برای تو مسدود می‌کند.</p>
            <audio ref={remoteAudioRef} autoPlay playsInline aria-label="صدای شنونده" />
          </section>
        )}

        <nav className={styles.footerLinks} aria-label="اطلاعات سرویس">
          <a href="/privacy">حریم خصوصی</a>
          <a href="/terms">قواعد استفاده</a>
          <a href="/account/delete">حذف حساب</a>
        </nav>
      </div>
    </main>
  );
}
