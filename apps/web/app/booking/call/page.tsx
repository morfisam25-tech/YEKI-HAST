'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CallCostQuote from '../../../components/caller/CallCostQuote';
import ReportPanel from '../../../components/caller/ReportPanel';
import styles from '../booking.module.css';

type VoiceSignal = {
  id: string;
  kind: 'offer' | 'answer' | 'ice' | 'media_connected' | 'reconnecting' | 'reconnected';
  senderRole: 'caller' | 'listener';
  payload: unknown;
};

type Phase = 'ready' | 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';

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

function fa(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false }).format(seconds % 60);
  return `${fa(minutes)}:${rest}`;
}

function message(code: string, browserName = ''): string {
  if (browserName === 'NotAllowedError' || browserName === 'SecurityError') return 'برای شروع باید دسترسی میکروفن را فعال کنی.';
  if (browserName === 'NotFoundError') return 'میکروفن قابل استفاده پیدا نشد.';
  const messages: Record<string, string> = {
    authentication_required: 'برای شروع ابتدا وارد حساب شو.',
    booking_not_due: 'زمان این رزرو هنوز نرسیده است.',
    booking_not_startable: 'این رزرو دیگر قابل شروع نیست.',
    booking_missed: 'زمان این رزرو گذشته است.',
    booking_party_busy: 'یکی از دو طرف الان در گفت‌وگوی دیگری است.',
    caller_age_gate_required: 'تأیید شرایط سنی لازم است. به صفحه رزرو برگرد و دوباره تأیید کن.',
    caller_consent_required: 'تأیید قواعد استفاده و مرزهای ایمنی لازم است. به صفحه رزرو برگرد و دوباره تأیید کن.',
    insufficient_balance: 'اعتبار برای شروع این گفت‌وگو کافی نیست.',
    call_transport_not_configured: 'مسیر امن صدا در این محیط هنوز آماده نیست.',
    internet_voice_not_primary: 'گفت‌وگوی صوتی در این محیط هنوز آماده نیست.',
    call_not_active: 'این گفت‌وگو دیگر فعال نیست.',
    call_not_found: 'گفت‌وگو پیدا نشد.',
    no_answer_window_active: 'هنوز فرصت پاسخ شنونده تمام نشده است.',
  };
  return messages[code] ?? 'شروع گفت‌وگو انجام نشد. دوباره تلاش کن.';
}

export default function BookingCallPage() {
  const [bookingId, setBookingId] = useState('');
  const [existingCallId, setExistingCallId] = useState('');
  const [callId, setCallId] = useState('');
  const [phase, setPhase] = useState<Phase>('ready');
  const [connectionUnstable, setConnectionUnstable] = useState(false);
  const [endedBySafety, setEndedBySafety] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('برای شروع، اول میکروفن را آماده می‌کنیم. ثبت رزرو به‌تنهایی هزینه‌ای ایجاد نمی‌کند.');
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [maxBillableSeconds, setMaxBillableSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [warning, setWarning] = useState<60 | 120 | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noAnswerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRef = useRef(new Set<string>());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const mediaConnectedSentRef = useRef(false);

  const phaseText = useMemo(() => {
    if (connectionUnstable && phase === 'connected') return 'اتصال ناپایدار است؛ در حال تلاش برای برگشت صدا…';
    if (phase === 'preparing') return 'در حال آماده‌کردن میکروفن…';
    if (phase === 'ringing') return 'در حال زنگ‌زدن به شنونده…';
    if (phase === 'connecting') return 'شنونده پاسخ داده؛ صدا در حال وصل‌شدن است…';
    if (phase === 'connected') return 'صدا وصل است.';
    if (phase === 'ended') return 'گفت‌وگو پایان یافته است.';
    return 'آماده شروع';
  }, [connectionUnstable, phase]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBookingId(params.get('bookingId') ?? '');
    setExistingCallId(params.get('callId') ?? '');
  }, []);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (noAnswerRef.current) clearTimeout(noAnswerRef.current);
    pollRef.current = null;
    noAnswerRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    seenRef.current.clear();
    pendingCandidatesRef.current = [];
    mediaConnectedSentRef.current = false;
    setConnectionUnstable(false);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (phase !== 'connected' || !connectedAt || !maxBillableSeconds) {
      setRemainingSeconds(null);
      setWarning(null);
      return;
    }
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(connectedAt)) / 1000));
      const remaining = Math.max(0, maxBillableSeconds - elapsed);
      setRemainingSeconds(remaining);
      setWarning(remaining <= 60 ? 60 : remaining <= 120 ? 120 : null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [phase, connectedAt, maxBillableSeconds]);

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
          setEndedBySafety(false);
          setPhase('ended');
          setRemainingSeconds(0);
          setWarning(null);
          setNotice(result.capReached ? 'زمان انتخاب‌شده تمام شد و گفت‌وگو پایان یافت.' : 'گفت‌وگو پایان یافت.');
          cleanup();
        }
      } catch {
        // Server timing remains authoritative; retry on the next supported heartbeat.
      } finally {
        running = false;
      }
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [callId, cleanup, phase]);

  const syncTiming = useCallback(async (id: string) => {
    const details = await api<{
      status: string;
      connectedAt: string | null;
      maxBillableSeconds: number | null;
    }>(`calls/${id}`);
    if (details.connectedAt) setConnectedAt(details.connectedAt);
    if (details.maxBillableSeconds) setMaxBillableSeconds(details.maxBillableSeconds);
    return details.status;
  }, []);

  const beginRtc = useCallback(async (id: string, stream: MediaStream) => {
    const voice = await api<{
      status: string;
      noAnswerSeconds: number;
      client: { iceServers: RTCIceServer[]; relayConfigured: boolean };
    }>(`calls/${id}/voice/start`, { method: 'POST', body: '{}' });
    if (!voice.client.relayConfigured && process.env.NODE_ENV === 'production') throw new Error('voice_relay_not_ready');

    setPhase('ringing');
    setNotice('در حال تماس با شنونده…');
    streamRef.current = stream;
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
          body: JSON.stringify({ kind: 'media_connected', payload: { source: 'web_booking' } }),
        });
        if (result.status === 'connected') {
          if (noAnswerRef.current) clearTimeout(noAnswerRef.current);
          setConnectionUnstable(false);
          setPhase('connected');
          setNotice('صدا وصل شد. هزینه فقط از زمان اتصال واقعی محاسبه می‌شود.');
          await syncTiming(id);
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
      if (pc.connectionState === 'failed') setError('اتصال صدا قطع شد. می‌توانی گفت‌وگو را پایان بدهی.');
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
          if (signal.senderRole !== 'listener' || seenRef.current.has(signal.id)) continue;
          seenRef.current.add(signal.id);
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
          setNotice('صدا وصل شد. هزینه فقط از زمان اتصال واقعی محاسبه می‌شود.');
          await syncTiming(id);
        } else if (result.status === 'missed') {
          setEndedBySafety(false);
          setPhase('ended');
          setNotice('این شنونده الان پاسخگو نیست. مبلغی از اعتبارت کم نشده. می‌تونی یک شنونده دیگه انتخاب کنی یا اعتبارت رو نگه داری.');
          cleanup();
        }
      } catch {
        // A temporary signaling read failure must not kill an active peer connection.
      } finally {
        polling = false;
      }
    };
    pollRef.current = setInterval(() => void poll(), 900);
    void poll();

    noAnswerRef.current = setTimeout(() => {
      void api(`calls/${id}/voice/no-answer`, { method: 'POST', body: '{}' })
        .then(() => {
          setEndedBySafety(false);
          setPhase('ended');
          setNotice('این شنونده الان پاسخگو نیست. مبلغی از اعتبارت کم نشده. می‌تونی یک شنونده دیگه انتخاب کنی یا اعتبارت رو نگه داری.');
          cleanup();
        })
        .catch(() => undefined);
    }, Math.max(1, voice.noAnswerSeconds) * 1000);
  }, [cleanup, syncTiming]);

  async function start() {
    if (busy || phase !== 'ready' || (!bookingId && !existingCallId)) return;
    setBusy(true);
    setEndedBySafety(false);
    setConnectedAt(null);
    setRemainingSeconds(null);
    setWarning(null);
    setError('');
    setNotice('در حال آماده‌کردن میکروفن…');
    setPhase('preparing');

    let stream: MediaStream | null = null;
    let createdCallId = existingCallId;
    let voiceClaimed = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (stream.getAudioTracks().length === 0) throw new DOMException('microphone_missing', 'NotFoundError');

      if (bookingId) {
        const started = await api<{ callId: string; maxBillableSeconds: number }>(`bookings/${bookingId}/start`, {
          method: 'POST',
          body: '{}',
        });
        createdCallId = started.callId;
        setMaxBillableSeconds(started.maxBillableSeconds);
      }
      if (!createdCallId) throw new Error('call_not_found');
      setCallId(createdCallId);

      await beginRtc(createdCallId, stream);
      voiceClaimed = true;
      stream = null;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'call_failed';
      const browserName = typeof DOMException !== 'undefined' && cause instanceof DOMException ? cause.name : '';
      if (createdCallId && bookingId && !voiceClaimed) {
        await api(`calls/${createdCallId}/voice/end`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'web_booking_start_failed' }),
        }).catch(async () => {
          await api(`calls/${createdCallId}/cancel`, { method: 'POST', body: '{}' }).catch(() => undefined);
        });
      }
      stream?.getTracks().forEach((track) => track.stop());
      cleanup();
      setCallId('');
      setPhase('ready');
      setError(code === 'voice_relay_not_ready' ? 'مسیر امن صدا در این محیط هنوز آماده نیست.' : message(code, browserName));
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
        body: JSON.stringify({ extensionMinutes: minutes, clientRequestId: `web-booking-${crypto.randomUUID()}` }),
      });
      setMaxBillableSeconds(result.maxBillableSeconds);
      setNotice(`${fa(minutes)} دقیقه به زمان گفت‌وگو اضافه شد.`);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'extend_failed';
      setError(code === 'insufficient_balance_for_extension' ? 'اعتبار برای این تمدید کافی نیست.' : 'تمدید گفت‌وگو انجام نشد.');
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
        ? { reason: 'web_booking_safety_exit', blockCounterparty: true }
        : { reason: 'web_booking_caller_ended' };
      const result = await api<{ billableSeconds?: number }>(`calls/${callId}/voice/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setEndedBySafety(path === 'safety-exit');
      setNotice(path === 'safety-exit'
        ? 'گفت‌وگو فوراً پایان یافت و این شنونده برای تو مسدود شد.'
        : result.billableSeconds === undefined
          ? 'گفت‌وگو پایان یافت.'
          : `گفت‌وگو پایان یافت. مدت محاسبه‌شده: ${fa(result.billableSeconds)} ثانیه.`);
      setPhase('ended');
      cleanup();
    } catch {
      setError('پایان گفت‌وگو تأیید نشد. دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }

  const hasTarget = Boolean(bookingId || existingCallId);

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shellNarrow}>
        <header className={styles.header}>
          <a className={styles.brand} href="/">یکی هست</a>
          <p className={styles.eyebrow}>زمان گفت‌وگو رسیده</p>
          <h1 className={styles.title}>گفت‌وگوی رزروشده</h1>
          <p className={styles.lead}>اول میکروفن آماده می‌شود، بعد ارتباط با شنونده شروع می‌شود. هزینه فقط از زمان اتصال واقعی محاسبه می‌شود.</p>
          <nav className={styles.nav} aria-label="مسیرهای گفت‌وگو">
            <a className={styles.link} href="/booking">رزروهای من</a>
            <a className={styles.link} href="/talk">گفت‌وگوی فوری</a>
          </nav>
        </header>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {notice && <div className={styles.notice} aria-live="polite">{notice}</div>}

        <section className={styles.callCard}>
          {!hasTarget ? (
            <p className={styles.empty}>این صفحه به رزرو مشخصی وصل نیست. از «رزروهای من» وارد گفت‌وگو شو.</p>
          ) : phase === 'ready' ? (
            <>
              <p className={styles.eyebrow}>آماده‌ای؟</p>
              <h2 className={styles.heading}>میکروفن را آماده کن</h2>
              <p className={styles.empty}>با زدن دکمه، مرورگر اجازه میکروفن می‌خواهد. اگر اجازه ندهی، گفت‌وگو شروع نمی‌شود.</p>
              <CallCostQuote bookingId={bookingId} className={styles.trustNote} />
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void start()}>
                آماده‌ام، شروع کن
              </button>
            </>
          ) : phase === 'ended' ? (
            <>
              <p className={styles.eyebrow}>پایان</p>
              <h2 className={styles.heading}>گفت‌وگو بسته شد</h2>
              {endedBySafety && callId && (
                <div className={styles.reportArea}>
                  <p className={styles.helper}>شنونده برای تو مسدود شده است. اگر لازم است، گزارش رفتار را هم جداگانه ثبت کن.</p>
                  <ReportPanel callId={callId} endpoint="safety/report" ended />
                </div>
              )}
              {!endedBySafety && connectedAt && callId && (
                <div className={styles.reportArea}>
                  <p className={styles.helper}>اگر در این گفت‌وگو مشکلی پیش آمد، گزارش را برای همین تماس ثبت کن.</p>
                  <ReportPanel callId={callId} endpoint="safety/report" ended />
                </div>
              )}
              <a className={styles.primaryLink} href="/booking">بازگشت به رزروها</a>
            </>
          ) : (
            <>
              <p className={styles.eyebrow}>گفت‌وگوی رزروشده</p>
              <h2 className={styles.heading}>گفت‌وگو</h2>
              <div
                className={`${styles.liveState} ${connectionUnstable ? styles.liveStateWarning : ''}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {phaseText}
              </div>
              {phase === 'connected' && remainingSeconds !== null && (
                <div className={`${styles.timeCard} ${warning ? styles.timeWarning : ''}`}>
                  <span>زمان باقی‌مانده</span>
                  <strong>{formatRemaining(remainingSeconds)}</strong>
                  {warning === 120 && <small>حدود ۲ دقیقه مانده</small>}
                  {warning === 60 && <small>حدود ۱ دقیقه مانده</small>}
                </div>
              )}
              {phase === 'connected' && (
                <div className={styles.row} aria-label="تمدید گفت‌وگو">
                  <button type="button" className={styles.secondary} disabled={busy} onClick={() => void extend(15)}>۱۵ دقیقه بیشتر</button>
                  <button type="button" className={styles.secondary} disabled={busy} onClick={() => void extend(30)}>۳۰ دقیقه بیشتر</button>
                </div>
              )}
              {callId && (
                <>
                  <div className={styles.callActions}>
                    <button type="button" className={styles.endButton} disabled={busy} onClick={() => void finish('end')}>پایان گفت‌وگو</button>
                    <button type="button" className={styles.safetyButton} disabled={busy} onClick={() => void finish('safety-exit')}>خروج فوری و مسدودکردن</button>
                  </div>
                  <p className={styles.helper}>«پایان گفت‌وگو» فقط مکالمه را می‌بندد. «خروج فوری و مسدودکردن» همان لحظه آن را می‌بندد و شنونده را برای تو مسدود می‌کند.</p>
                  <div className={styles.reportArea}>
                    <ReportPanel callId={callId} endpoint="safety/report" />
                  </div>
                </>
              )}
              <audio ref={remoteAudioRef} autoPlay playsInline aria-label="صدای شنونده" />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
