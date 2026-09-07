'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

function message(code: string, browserName = ''): string {
  if (browserName === 'NotAllowedError' || browserName === 'SecurityError') return 'برای تماس باید دسترسی میکروفن را فعال کنی.';
  if (browserName === 'NotFoundError') return 'میکروفن قابل استفاده پیدا نشد.';
  const messages: Record<string, string> = {
    authentication_required: 'برای تماس ابتدا وارد حساب شو.',
    booking_not_due: 'زمان این رزرو هنوز نرسیده است.',
    booking_not_startable: 'این رزرو دیگر قابل شروع نیست.',
    booking_missed: 'بازه این رزرو گذشته است.',
    booking_party_busy: 'یکی از دو طرف الان تماس فعال دیگری دارد.',
    caller_age_gate_required: 'تأیید شرط سنی نسخه جاری لازم است. به صفحه رزرو برگرد و دوباره تأیید کن.',
    insufficient_balance: 'اعتبار برای شروع این تماس کافی نیست.',
    call_transport_not_configured: 'مسیر تماس اینترنتی در این محیط آماده نیست.',
    internet_voice_not_primary: 'مسیر اصلی تماس این محیط Internet Voice نیست.',
    call_not_active: 'این تماس دیگر فعال نیست.',
    call_not_found: 'تماس پیدا نشد.',
    no_answer_window_active: 'مهلت پاسخ شنونده هنوز تمام نشده است.',
  };
  return messages[code] ?? 'شروع تماس انجام نشد. دوباره تلاش کن.';
}

export default function BookingCallPage() {
  const [bookingId, setBookingId] = useState('');
  const [existingCallId, setExistingCallId] = useState('');
  const [callId, setCallId] = useState('');
  const [phase, setPhase] = useState<Phase>('ready');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('برای شروع، میکروفن را آماده کن. تا قبل از این مرحله برای رزرو آینده HOLD ساخته نشده است.');
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [maxBillableSeconds, setMaxBillableSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noAnswerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRef = useRef(new Set<string>());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const mediaConnectedSentRef = useRef(false);

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
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (phase !== 'connected' || !connectedAt || !maxBillableSeconds) {
      setRemainingSeconds(null);
      return;
    }
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(connectedAt)) / 1000));
      setRemainingSeconds(Math.max(0, maxBillableSeconds - elapsed));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [phase, connectedAt, maxBillableSeconds]);

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
          setPhase('connected');
          setNotice('تماس وصل شد. هزینه از زمان اتصال واقعی محاسبه می‌شود.');
          await syncTiming(id);
        }
      } catch {
        mediaConnectedSentRef.current = false;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') void markMediaConnected();
      if (pc.connectionState === 'disconnected') setNotice('اتصال ضعیف شده؛ در حال تلاش برای برگشت…');
      if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. تماس را پایان بده.');
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
          await syncTiming(id);
        } else if (result.status === 'missed') {
          setPhase('ended');
          setNotice('شنونده پاسخ نداد. مبلغی از اعتبار کم نشده است.');
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
          setPhase('ended');
          setNotice('شنونده پاسخ نداد. مبلغی از اعتبار کم نشده است.');
          cleanup();
        })
        .catch(() => undefined);
    }, Math.max(1, voice.noAnswerSeconds) * 1000);
  }, [cleanup, syncTiming]);

  async function start() {
    if (busy || phase !== 'ready' || (!bookingId && !existingCallId)) return;
    setBusy(true);
    setError('');
    setNotice('در حال آماده‌کردن میکروفن…');
    setPhase('preparing');

    let stream: MediaStream | null = null;
    let createdCallId = existingCallId;
    let voiceClaimed = false;
    try {
      // Microphone permission happens before POST /bookings/:id/start, so a denied permission
      // cannot create a new Wallet HOLD for a future reservation.
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
      setError(code === 'voice_relay_not_ready'
        ? 'مسیر Relay امن برای تماس هنوز آماده نیست.'
        : message(code, browserName));
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
      setNotice(`${fa(minutes)} دقیقه به سقف تماس اضافه شد.`);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'extend_failed';
      setError(code === 'insufficient_balance_for_extension' ? 'اعتبار برای این تمدید کافی نیست.' : 'تمدید تماس انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!callId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ billableSeconds?: number }>(`calls/${callId}/voice/end`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'web_booking_caller_ended' }),
      });
      setNotice(result.billableSeconds === undefined
        ? 'تماس پایان یافت.'
        : `تماس پایان یافت؛ ${fa(result.billableSeconds)} ثانیه قابل محاسبه ثبت شد.`);
      setPhase('ended');
      cleanup();
    } catch {
      setError('پایان تماس تأیید نشد. دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }

  const hasTarget = Boolean(bookingId || existingCallId);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>تماس رزروشده</h1>
          <p className={styles.lead}>میکروفن اول آماده می‌شود. برای رزروی که هنوز شروع نشده، HOLD بعد از این مرحله و فقط هنگام ساخت CallSession ایجاد می‌شود.</p>
          <nav className={styles.nav}>
            <a className={styles.link} href="/booking">رزروهای من</a>
            <a className={styles.link} href="/talk">تماس فوری</a>
          </nav>
        </header>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {notice && <div className={styles.notice} aria-live="polite">{notice}</div>}

        <section className={styles.card}>
          {!hasTarget ? (
            <p className={styles.empty}>شناسه رزرو یا تماس در آدرس وجود ندارد. از صفحه رزروهای من وارد این بخش شو.</p>
          ) : phase === 'ready' ? (
            <>
              <h2 className={styles.heading}>آماده شروع</h2>
              <p className={styles.empty}>با زدن دکمه، مرورگر دسترسی میکروفن می‌خواهد و بعد تماس با شنونده آغاز می‌شود.</p>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void start()}>
                آماده‌ام، شروع تماس
              </button>
            </>
          ) : phase === 'ended' ? (
            <>
              <h2 className={styles.heading}>تماس بسته شد</h2>
              <a className={styles.link} href="/booking">بازگشت به رزروها</a>
            </>
          ) : (
            <>
              <h2 className={styles.heading}>تماس فعال</h2>
              <p className={styles.empty}>
                {phase === 'preparing' ? 'در حال آماده‌سازی…' : phase === 'ringing' ? 'منتظر پاسخ شنونده…' : phase === 'connecting' ? 'در حال اتصال صدا…' : 'تماس وصل است.'}
              </p>
              {phase === 'connected' && remainingSeconds !== null && (
                <div className={remainingSeconds <= 120 ? styles.error : styles.notice}>
                  زمان باقی‌مانده از سقف: {fa(Math.floor(remainingSeconds / 60))}:{String(remainingSeconds % 60).padStart(2, '0')}
                </div>
              )}
              {phase === 'connected' && (
                <div className={styles.row}>
                  <button type="button" className={styles.secondary} disabled={busy} onClick={() => void extend(15)}>+۱۵ دقیقه</button>
                  <button type="button" className={styles.secondary} disabled={busy} onClick={() => void extend(30)}>+۳۰ دقیقه</button>
                </div>
              )}
              {callId && <button type="button" className={styles.danger} disabled={busy} onClick={() => void end()}>پایان تماس</button>}
              <audio ref={remoteAudioRef} autoPlay playsInline aria-label="صدای شنونده" />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
