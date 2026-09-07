'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Listener = {
  id: string;
  nickname: string;
  verified: boolean;
  reliabilityScore: number;
  shortIntro: string | null;
  listeningStyle: string | null;
  completedCalls: number;
  ratingAverage: number | null;
  ratingCount: number;
  presence: string;
  languages: Array<{ code: string; nameFa: string; proficiency: string }>;
};

type Wallet = {
  currencyCode: string;
  balanceMinor: string;
  reservedMinor: string;
  availableMinor: string;
};

type VoiceSignal = {
  id: string;
  kind: 'offer' | 'answer' | 'ice' | 'media_connected' | 'reconnecting' | 'reconnected';
  senderRole: 'caller' | 'listener';
  payload: unknown;
};

type CallPhase = 'idle' | 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';

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

function formatWallet(wallet: Wallet | null): string {
  if (!wallet) return 'اعتبار ثبت نشده';
  const value = BigInt(wallet.availableMinor);
  if (wallet.currencyCode === 'IRR') return `${faNumber(Number(value / BigInt(10)))} تومان`;
  return `${wallet.availableMinor} ${wallet.currencyCode}`;
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'برای تماس ابتدا از صفحه اصلی وارد حساب شو.',
    caller_closed_beta: 'Caller هنوز در این محیط باز نشده است.',
    caller_closed_beta_disabled: 'Caller هنوز در این محیط باز نشده است.',
    caller_age_policy_not_configured: 'قانون سن Caller در این محیط هنوز تنظیم نشده است.',
    caller_age_gate_required: 'برای ادامه باید شرط سنی سرویس را تأیید کنی.',
    caller_consent_required: 'برای ادامه باید قوانین استفاده و مرزبندی ایمنی را بپذیری.',
    no_listener_available: 'این شنونده دیگر آنلاین نیست. یک گزینه دیگر انتخاب کن.',
    insufficient_balance: 'اعتبار برای سقف زمانی انتخاب‌شده کافی نیست.',
    insufficient_balance_for_extension: 'اعتبار برای این تمدید کافی نیست.',
    call_transport_not_configured: 'مسیر صوتی امن هنوز در این محیط آماده نیست.',
    voice_relay_not_ready: 'مسیر صوتی امن هنوز در این محیط آماده نیست.',
    caller_call_already_active: 'یک تماس فعال از قبل وجود دارد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره تلاش کن.';
}

export default function TalkPage() {
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selected, setSelected] = useState<Listener | null>(null);
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
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const refreshMarketplace = useCallback(async () => {
    setError('');
    try {
      const [listenerResult, walletResult] = await Promise.all([
        api<{ listeners: Listener[] }>('listeners?language=fa&online=true&limit=30'),
        api<{ wallets: Wallet[] }>('wallet'),
      ]);
      setListeners(listenerResult.listeners);
      setWallet(walletResult.wallets.find((item) => item.currencyCode === 'IRR') ?? walletResult.wallets[0] ?? null);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'load_failed'));
    }
  }, []);

  useEffect(() => {
    void refreshMarketplace();
    return cleanupRtc;
  }, [cleanupRtc, refreshMarketplace]);

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
          setNotice(result.capReached ? 'سقف زمان تماس رسید و تماس خودکار پایان یافت.' : 'تماس پایان یافت.');
          cleanupRtc();
          void refreshMarketplace();
        }
      } catch {
        // DB sweeper remains authoritative; retry on next heartbeat.
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
        void api(`calls/${id}/voice/signals`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'reconnected', payload: { source: 'peer_connection_state' } }),
        }).catch(() => undefined);
        void markMediaConnected();
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        void api(`calls/${id}/voice/signals`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'reconnecting', payload: { source: 'peer_connection_state' } }),
        }).catch(() => undefined);
      }
      if (pc.connectionState === 'disconnected') setNotice('اتصال ضعیف شده؛ در حال تلاش برای برگشت…');
      if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. تماس را پایان بده و دوباره تلاش کن.');
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
              setNotice('شنونده پاسخ داد؛ در حال برقراری صدا…');
            }
          } else if (signal.kind === 'ice') {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => undefined);
            else pendingCandidatesRef.current.push(candidate);
          }
        }
        if (result.status === 'connected') {
          if (noAnswerRef.current) clearTimeout(noAnswerRef.current);
          setPhase('connected');
          setNotice('تماس وصل شد.');
          await syncCallTiming(id);
        } else if (result.status === 'missed') {
          setPhase('ended');
          setNotice('این شنونده پاسخ نداد. مبلغی از اعتبار کم نشده است.');
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
          setNotice('این شنونده پاسخ نداد. مبلغی از اعتبار کم نشده است.');
          cleanupRtc();
          void refreshMarketplace();
        })
        .catch(() => undefined);
    }, Math.max(1, voice.noAnswerSeconds) * 1000);
  }, [cleanupRtc, refreshMarketplace, syncCallTiming]);

  async function startCall() {
    if (!selected || busy || !policiesReady) return;
    setBusy(true);
    setPhase('preparing');
    setError('');
    setNotice('در حال ثبت تأییدها و بررسی میکروفن…');

    let preparedStream: MediaStream | null = null;
    let createdCallId: string | null = null;
    let voiceStarted = false;
    try {
      const policy = await api<{
        minimumAge: number;
        termsVersion: string;
        safetyProtocolVersion: string;
      }>('caller/age-gate', {
        method: 'POST',
        body: JSON.stringify({ confirmed: true, termsAccepted: true, safetyAccepted: true }),
      });
      setNotice(`تأیید سن ${faNumber(policy.minimumAge)}+ و قوانین نسخه جاری ثبت شد.`);

      preparedStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (preparedStream.getAudioTracks().length === 0) throw new DOMException('microphone_missing', 'NotFoundError');

      const languageCode = selected.languages.find((item) => item.code === 'fa')?.code ?? selected.languages[0]?.code ?? 'fa';
      const call = await api<{ callId: string; maxBillableSeconds: number }>('calls/request', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: `web-${crypto.randomUUID()}`,
          listenerId: selected.id,
          listenerGender: 'any',
          languageCode,
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
      setNotice(`${faNumber(minutes)} دقیقه به سقف تماس اضافه شد.`);
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
        ? 'تماس برای ایمنی پایان یافت و طرف مقابل بلاک شد.'
        : result.billableSeconds === undefined
          ? 'تماس پایان یافت.'
          : `تماس پایان یافت؛ ${faNumber(result.billableSeconds)} ثانیه قابل محاسبه ثبت شد.`);
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
    <main className="talk-page">
      <header className="site-header">
        <a className="brand" href="/">یکی هست</a>
        <span>گفت‌وگوی اینترنتی با شنونده انسانی</span>
      </header>

      <section className="listener-note">
        <div>
          <p className="kicker">اعتبار قابل استفاده</p>
          <h1>{formatWallet(wallet)}</h1>
        </div>
        <p>زمان انتخابی سقف تماس است. قبل از اتصال فقط HOLD می‌شود؛ هزینه از زمان اتصال واقعی حساب می‌شود.</p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="helper" aria-live="polite">{notice}</p>}

      {(phase === 'idle' || phase === 'ended') ? (
        <>
          <section className="call-setup" aria-labelledby="rules-title">
            <p className="kicker">قبل از اولین تماس</p>
            <h2 id="rules-title">مرزهای گفت‌وگو روشن است</h2>
            <p>«یکی هست» برای شنیده‌شدن و گفت‌وگوی محترمانه است. شنونده مشاور پزشکی، روان‌شناس، وکیل یا سرویس اضطراری نیست. این فضا برای دوست‌یابی، سکس‌چت، گرفتن شماره/آیدی یا انتقال رابطه به بیرون اپ ساخته نشده است.</p>
            <label className="age-check">
              <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />
              <span>تأیید می‌کنم حداقل سن اعلام‌شده سرویس را دارم.</span>
            </label>
            <label className="age-check">
              <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
              <span>قوانین استفاده را خواندم و می‌پذیرم. <a href="/terms">مشاهده قوانین</a></span>
            </label>
            <label className="age-check">
              <input type="checkbox" checked={safetyAccepted} onChange={(event) => setSafetyAccepted(event.target.checked)} />
              <span>می‌پذیرم محترمانه رفتار کنم؛ اینجا محل دوست‌یابی یا مشاوره تخصصی نیست و اطلاعات تماس شخصی ردوبدل نمی‌کنم.</span>
            </label>
          </section>

          <section aria-labelledby="listeners-title">
            <div className="section-heading">
              <div>
                <p className="kicker">همین الان</p>
                <h2 id="listeners-title">یک شنونده آنلاین انتخاب کن</h2>
              </div>
              <button type="button" className="text-button" onClick={() => void refreshMarketplace()}>به‌روزرسانی</button>
            </div>
            <div className="listener-grid">
              {listeners.map((listener) => (
                <button
                  type="button"
                  key={listener.id}
                  className={`listener-card ${selected?.id === listener.id ? 'selected' : ''}`}
                  onClick={() => setSelected(listener)}
                >
                  <strong>{listener.nickname}</strong>
                  <span>{listener.verified ? 'هویت/فیلدهای تأییدشده مشخص است' : 'اطلاعات تأیید نشده'}</span>
                  <span>{listener.ratingAverage === null ? 'بدون امتیاز' : `امتیاز ${listener.ratingAverage.toFixed(1)} از ${faNumber(listener.ratingCount)} نظر`}</span>
                  {listener.shortIntro && <small>معرفی خوداظهاری (تأییدنشده): {listener.shortIntro}</small>}
                </button>
              ))}
              {!listeners.length && !error && <p>الان شنونده آنلاین پیدا نشد.</p>}
            </div>
          </section>

          <section className="call-setup" aria-labelledby="duration-title">
            <h2 id="duration-title">پکیج زمانی</h2>
            <div className="duration-options">
              {([600, 1800, 3600] as const).map((seconds) => (
                <button
                  type="button"
                  key={seconds}
                  aria-pressed={capSeconds === seconds}
                  className={capSeconds === seconds ? 'selected' : ''}
                  onClick={() => setCapSeconds(seconds)}
                >
                  {faNumber(seconds / 60)} دقیقه
                </button>
              ))}
            </div>
            <button type="button" disabled={!selected || !policiesReady || busy} onClick={() => void startCall()}>
              {busy ? 'در حال آماده‌سازی…' : 'شروع تماس اینترنتی'}
            </button>
            {!policiesReady && <p className="helper">برای شروع تماس هر سه تأیید بالا لازم است.</p>}
          </section>
        </>
      ) : (
        <section className="live-call" aria-labelledby="live-call-title">
          <p className="kicker">تماس فعال</p>
          <h2 id="live-call-title">{selected?.nickname ?? 'شنونده'}</h2>
          <p>{phase === 'preparing' ? 'در حال آماده‌سازی میکروفن…' : phase === 'ringing' ? 'منتظر پاسخ شنونده…' : phase === 'connecting' ? 'در حال اتصال صدا…' : 'تماس وصل است.'}</p>
          {phase === 'connected' && remainingSeconds !== null && (
            <p className={warning ? 'error' : ''}>
              زمان باقی‌مانده: {faNumber(Math.floor(remainingSeconds / 60))}:{faNumber(remainingSeconds % 60).padStart(2, '۰')}
              {warning === 120 ? ' — ۲ دقیقه مانده' : warning === 60 ? ' — ۱ دقیقه مانده' : ''}
            </p>
          )}
          {phase === 'connected' && (
            <div className="duration-options">
              <button type="button" disabled={busy} onClick={() => void extend(15)}>+۱۵ دقیقه</button>
              <button type="button" disabled={busy} onClick={() => void extend(30)}>+۳۰ دقیقه</button>
            </div>
          )}
          {callId && (
            <div className="duration-options">
              <button type="button" disabled={busy} onClick={() => void finish('end')}>پایان تماس</button>
              <button type="button" disabled={busy} onClick={() => void finish('safety-exit')}>خروج امن + بلاک</button>
            </div>
          )}
          <audio ref={remoteAudioRef} autoPlay playsInline aria-label="صدای شنونده" />
        </section>
      )}

      <nav className="public-links" aria-label="اطلاعات سرویس">
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
      </nav>
    </main>
  );
}
