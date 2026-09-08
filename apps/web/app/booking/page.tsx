'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './booking.module.css';

type Language = { code: string; nameFa: string; nameEn?: string | null; proficiency: string };
type BookableListener = {
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
  nextAvailableAt: string;
  languages: Language[];
};

type BusyInterval = { startsAt: string; endsAt: string };
type Availability = { id: string; startsAt: string; endsAt: string; busy: BusyInterval[] };
type Booking = {
  id: string;
  listenerId: string;
  listenerNickname: string;
  languageCode: string;
  scheduledAt: string;
  maxBillableSeconds: number;
  status: 'booked' | 'cancelled' | 'initiated' | 'missed';
  callId: string | null;
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

function fa(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}

function faDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (item: number) => String(item).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function message(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'برای رزرو، ابتدا از صفحه اصلی وارد حساب شو.',
    caller_closed_beta_disabled: 'مسیر گفت‌وگو در محیط فعلی هنوز باز نشده است.',
    caller_age_gate_required: 'قبل از رزرو باید شرط سنی نسخه جاری را تأیید کنی.',
    availability_not_bookable: 'این بازه دیگر قابل رزرو نیست. زمان دیگری انتخاب کن.',
    booking_time_conflict: 'این زمان با یک رزرو دیگر تداخل دارد.',
    listener_language_unavailable: 'زبان انتخاب‌شده برای این شنونده در دسترس نیست.',
    booking_must_be_future: 'زمان رزرو باید در آینده باشد.',
    insufficient_balance: 'برای شروع تماس در زمان رزرو، اعتبار کافی لازم است.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات انجام نشد. دوباره تلاش کن.';
}

export default function BookingPage() {
  const [listeners, setListeners] = useState<BookableListener[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<BookableListener | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [availabilityId, setAvailabilityId] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [languageCode, setLanguageCode] = useState('fa');
  const [maxSeconds, setMaxSeconds] = useState<600 | 1800 | 3600>(1800);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedWindow = useMemo(
    () => availability.find((item) => item.id === availabilityId) ?? null,
    [availability, availabilityId],
  );

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [listenerResult, bookingResult] = await Promise.all([
        api<{ listeners: BookableListener[] }>('bookable-listeners?language=fa&limit=30'),
        api<{ bookings: Booking[] }>('bookings'),
      ]);
      setListeners(listenerResult.listeners);
      setBookings(bookingResult.bookings);
    } catch (cause) {
      setError(message(cause instanceof Error ? cause.message : 'network_error'));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function chooseListener(listener: BookableListener) {
    setSelected(listener);
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api<{ availability: Availability[] }>(`listeners/${listener.id}/availability`);
      setAvailability(result.availability);
      const first = result.availability[0];
      setAvailabilityId(first?.id ?? '');
      setScheduledLocal(first ? toLocalInput(first.startsAt) : '');
      const preferred = listener.languages.find((item) => item.code === 'fa') ?? listener.languages[0];
      setLanguageCode(preferred?.code ?? 'fa');
    } catch (cause) {
      setAvailability([]);
      setAvailabilityId('');
      setScheduledLocal('');
      setError(message(cause instanceof Error ? cause.message : 'network_error'));
    } finally {
      setBusy(false);
    }
  }

  function chooseWindow(window: Availability) {
    setAvailabilityId(window.id);
    setScheduledLocal(toLocalInput(window.startsAt));
  }

  function clientTimeFits(): boolean {
    if (!selectedWindow || !scheduledLocal) return false;
    const start = new Date(scheduledLocal);
    const startMs = start.getTime();
    const endMs = startMs + maxSeconds * 1000;
    if (!Number.isFinite(startMs)) return false;
    if (startMs < Date.parse(selectedWindow.startsAt) || endMs > Date.parse(selectedWindow.endsAt)) return false;
    return !selectedWindow.busy.some((item) => startMs < Date.parse(item.endsAt) && endMs > Date.parse(item.startsAt));
  }

  async function createReservation() {
    if (!selected || !selectedWindow || !scheduledLocal || !ageConfirmed || busy) return;
    if (!clientTimeFits()) {
      setError('زمان انتخاب‌شده داخل بازه آزاد این شنونده نیست یا با رزرو دیگری تداخل دارد.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('caller/age-gate', {
        method: 'POST',
        body: JSON.stringify({ confirmed: true }),
      });
      await api('bookings', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: `web-booking-${crypto.randomUUID()}`,
          availabilityId: selectedWindow.id,
          languageCode,
          scheduledAt: new Date(scheduledLocal).toISOString(),
          maxSeconds,
        }),
      });
      setNotice('رزرو ثبت شد. مبلغی در این مرحله کسر یا کنار گذاشته نمی‌شود؛ رزرو موقت اعتبار فقط هنگام شروع تماس ساخته می‌شود.');
      await refresh();
      await chooseListener(selected);
    } catch (cause) {
      setError(message(cause instanceof Error ? cause.message : 'network_error'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelReservation(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`bookings/${id}/cancel`, { method: 'POST', body: '{}' });
      setNotice('رزرو لغو شد.');
      await refresh();
      if (selected) await chooseListener(selected);
    } catch (cause) {
      setError(message(cause instanceof Error ? cause.message : 'network_error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>رزرو گفت‌وگو</h1>
          <p className={styles.lead}>زمانی را که شنونده از قبل باز کرده انتخاب کن. سقف اولیه تماس فقط ۱۰، ۳۰ یا ۶۰ دقیقه است.</p>
          <nav className={styles.nav}>
            <a className={styles.link} href="/talk">تماس فوری</a>
            <a className={styles.link} href="/">صفحه اصلی</a>
          </nav>
        </header>

        {error && <div className={styles.error}>{error}</div>}
        {notice && <div className={styles.notice}>{notice}</div>}

        <section className={styles.card}>
          <h2 className={styles.heading}>شنونده‌های قابل رزرو</h2>
          {listeners.length === 0 ? (
            <p className={styles.empty}>فعلاً بازه رزرو آینده‌ای ثبت نشده است.</p>
          ) : (
            <div className={styles.grid}>
              {listeners.map((listener) => (
                <button
                  key={listener.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void chooseListener(listener)}
                  className={`${styles.listener} ${selected?.id === listener.id ? styles.listenerSelected : ''}`}
                >
                  <span className={styles.listenerName}>{listener.nickname}</span>
                  <span className={styles.meta}>نزدیک‌ترین زمان: {faDate(listener.nextAvailableAt)}</span><br />
                  <span className={styles.meta}>امتیاز اعتماد: {fa(listener.reliabilityScore)} · تماس تکمیل‌شده: {fa(listener.completedCalls)}</span>
                  {listener.shortIntro && <><br /><span className={styles.meta}>معرفی خوداظهاری: {listener.shortIntro}</span></>}
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section className={styles.card}>
            <h2 className={styles.heading}>زمان رزرو با {selected.nickname}</h2>
            {availability.length === 0 ? (
              <p className={styles.empty}>بازه آزاد قابل رزروی برای این شنونده باقی نمانده است.</p>
            ) : (
              <>
                <div className={styles.row}>
                  {availability.map((window) => (
                    <button
                      key={window.id}
                      type="button"
                      disabled={busy}
                      className={`${styles.pill} ${availabilityId === window.id ? styles.pillActive : ''}`}
                      onClick={() => chooseWindow(window)}
                    >
                      {faDate(window.startsAt)} تا {faDate(window.endsAt)}
                    </button>
                  ))}
                </div>

                <label>
                  <span className={styles.meta}>شروع تماس</span>
                  <input
                    className={styles.control}
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(event) => setScheduledLocal(event.target.value)}
                  />
                </label>

                <div>
                  <span className={styles.meta}>سقف اولیه</span>
                  <div className={styles.row}>
                    {([600, 1800, 3600] as const).map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        className={`${styles.pill} ${maxSeconds === seconds ? styles.pillActive : ''}`}
                        onClick={() => setMaxSeconds(seconds)}
                      >
                        {fa(seconds / 60)} دقیقه
                      </button>
                    ))}
                  </div>
                </div>

                <label>
                  <span className={styles.meta}>زبان</span>
                  <select className={styles.control} value={languageCode} onChange={(event) => setLanguageCode(event.target.value)}>
                    {selected.languages.map((language) => (
                      <option key={language.code} value={language.code}>{language.nameFa || language.code}</option>
                    ))}
                  </select>
                </label>

                {selectedWindow?.busy.length ? (
                  <div className={styles.notice}>
                    زمان‌های پر در همین بازه: {selectedWindow.busy.map((item) => `${faDate(item.startsAt)} تا ${faDate(item.endsAt)}`).join('، ')}
                  </div>
                ) : null}

                <label className={styles.row}>
                  <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />
                  <span>شرط سنی سرویس را دارم.</span>
                </label>

                <button
                  type="button"
                  disabled={busy || !ageConfirmed || !clientTimeFits()}
                  className={styles.primary}
                  onClick={() => void createReservation()}
                >
                  {busy ? 'در حال ثبت…' : 'ثبت رزرو'}
                </button>
              </>
            )}
          </section>
        )}

        <section className={styles.card}>
          <h2 className={styles.heading}>رزروهای من</h2>
          {bookings.length === 0 ? (
            <p className={styles.empty}>هنوز رزروی ثبت نشده است.</p>
          ) : bookings.map((booking) => (
            <div key={booking.id} className={styles.booking}>
              <strong>{booking.listenerNickname}</strong>
              <span className={styles.meta}>{faDate(booking.scheduledAt)} · {fa(booking.maxBillableSeconds / 60)} دقیقه · {booking.languageCode}</span>
              <span className={styles.meta}>وضعیت: {booking.status}</span>
              {booking.status === 'booked' && (
                <div className={styles.row}>
                  <a className={styles.primary} href={`/booking/call?bookingId=${encodeURIComponent(booking.id)}`}>ورود به تماس رزروشده</a>
                  <button type="button" disabled={busy} className={styles.danger} onClick={() => void cancelReservation(booking.id)}>لغو رزرو</button>
                </div>
              )}
              {booking.status === 'initiated' && booking.callId && (
                <a className={styles.link} href={`/booking/call?callId=${encodeURIComponent(booking.callId)}`}>ادامه تماس</a>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
