'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CallCostQuote from '../../components/caller/CallCostQuote';
import styles from './booking.module.css';

type Language = { code: string; nameFa: string; nameEn?: string | null; proficiency: string };
type GenderFilter = 'any' | 'female' | 'male';
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

function faDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  if (timeZone) options.timeZone = timeZone;
  return new Intl.DateTimeFormat('fa-IR', options).format(date);
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (item: number) => String(item).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function bookingStatus(status: Booking['status']): string {
  if (status === 'booked') return 'برنامه‌ریزی‌شده';
  if (status === 'initiated') return 'تماس شروع شده';
  if (status === 'cancelled') return 'لغوشده';
  return 'از دست‌رفته';
}

function message(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'برای رزرو، ابتدا از صفحه اصلی وارد حساب شو.',
    caller_closed_beta_disabled: 'این بخش هنوز برای استفاده عمومی فعال نشده است.',
    caller_age_gate_required: 'قبل از رزرو باید شرایط سنی سرویس را تأیید کنی.',
    caller_consent_required: 'برای رزرو باید قواعد استفاده و مرزهای ایمنی را هم بپذیری.',
    availability_not_bookable: 'این بازه دیگر قابل رزرو نیست. زمان دیگری را انتخاب کن.',
    booking_time_conflict: 'این زمان با یک رزرو دیگر تداخل دارد.',
    listener_language_unavailable: 'این شنونده در زبان انتخاب‌شده گفت‌وگو نمی‌کند.',
    booking_must_be_future: 'زمان رزرو باید در آینده باشد.',
    insufficient_balance: 'برای شروع گفت‌وگو در زمان رزرو، اعتبار کافی لازم است.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'این کار انجام نشد. دوباره تلاش کن.';
}

function mergeLanguages(current: Language[], listeners: BookableListener[]): Language[] {
  const byCode = new Map(current.map((item) => [item.code, item]));
  for (const listener of listeners) {
    for (const language of listener.languages) byCode.set(language.code, language);
  }
  return [...byCode.values()].sort((a, b) => (a.nameFa || a.code).localeCompare(b.nameFa || b.code, 'fa'));
}

function languageName(code: string, languages: Language[]): string {
  const known = languages.find((item) => item.code === code);
  if (known) return known.nameFa || known.nameEn || code;
  try {
    return new Intl.DisplayNames(['fa'], { type: 'language' }).of(code) ?? 'زبان انتخاب‌شده';
  } catch {
    return 'زبان انتخاب‌شده';
  }
}

export default function BookingPage() {
  const [listeners, setListeners] = useState<BookableListener[]>([]);
  const [knownLanguages, setKnownLanguages] = useState<Language[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('any');
  const [languageFilter, setLanguageFilter] = useState('any');
  const [selected, setSelected] = useState<BookableListener | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [availabilityId, setAvailabilityId] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [languageCode, setLanguageCode] = useState('fa');
  const [maxSeconds, setMaxSeconds] = useState<600 | 1800 | 3600>(1800);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [timeZone, setTimeZone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const policiesReady = ageConfirmed && termsAccepted && safetyAccepted;
  const selectedWindow = useMemo(
    () => availability.find((item) => item.id === availabilityId) ?? null,
    [availability, availabilityId],
  );

  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    } catch {
      setTimeZone('');
    }
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (genderFilter !== 'any') params.set('gender', genderFilter);
      if (languageFilter !== 'any') params.set('language', languageFilter);
      const [listenerResult, bookingResult] = await Promise.all([
        api<{ listeners: BookableListener[] }>(`bookable-listeners?${params.toString()}`),
        api<{ bookings: Booking[] }>('bookings'),
      ]);
      setListeners(listenerResult.listeners);
      setKnownLanguages((current) => mergeLanguages(current, listenerResult.listeners));
      setBookings(bookingResult.bookings);
      setSelected((current) => current && listenerResult.listeners.some((item) => item.id === current.id) ? current : null);
    } catch (cause) {
      setError(message(cause instanceof Error ? cause.message : 'network_error'));
    }
  }, [genderFilter, languageFilter]);

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
      const preferred = listener.languages.find((item) => item.code === languageFilter)
        ?? listener.languages.find((item) => item.code === 'fa')
        ?? listener.languages[0];
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
    if (!selected || !selectedWindow || !scheduledLocal || !policiesReady || busy) return;
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
        body: JSON.stringify({ confirmed: true, termsAccepted: true, safetyAccepted: true }),
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
      setNotice('رزرو ثبت شد. خود رزرو هزینه‌ای ندارد؛ هزینه فقط از زمان اتصال واقعی محاسبه می‌شود.');
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
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.brand} href="/">یکی هست</a>
          <p className={styles.eyebrow}>برای وقتی که الان زمان مناسبی نیست</p>
          <h1 className={styles.title}>رزرو گفت‌وگو</h1>
          <p className={styles.lead}>زمانی را از برنامه واقعی شنونده انتخاب کن. ثبت رزرو به‌تنهایی هزینه‌ای ندارد.</p>
          <div className={styles.timeZone}>
            <span>همه زمان‌ها بر اساس ساعت همین دستگاه نمایش داده می‌شوند.</span>
            <strong>{timeZone || 'منطقه زمانی دستگاه'}</strong>
          </div>
          <nav className={styles.nav} aria-label="مسیرهای گفت‌وگو">
            <a className={styles.link} href="/talk">گفت‌وگوی فوری</a>
            <a className={styles.link} href="/">صفحه اصلی</a>
          </nav>
        </header>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {notice && <div className={styles.notice} aria-live="polite">{notice}</div>}

        <section className={styles.card}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>شنونده‌ها</p>
              <h2 className={styles.heading}>کسی را انتخاب کن که برایت مناسب‌تر است</h2>
            </div>
          </div>

          <div className={styles.filters}>
            <label className={styles.field}>
              <span>زبان گفت‌وگو</span>
              <select className={styles.control} value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
                <option value="any">همه زبان‌ها</option>
                {knownLanguages.map((language) => (
                  <option key={language.code} value={language.code}>{language.nameFa || language.nameEn || language.code}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>جنسیت شنونده</span>
              <select className={styles.control} value={genderFilter} onChange={(event) => setGenderFilter(event.target.value as GenderFilter)}>
                <option value="any">فرقی ندارد</option>
                <option value="female">زن</option>
                <option value="male">مرد</option>
              </select>
            </label>
          </div>

          {listeners.length === 0 ? (
            <p className={styles.empty}>فعلاً زمان قابل رزروی با این انتخاب‌ها ثبت نشده است.</p>
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
                  <span className={styles.listenerTopline}>
                    <span className={styles.listenerName}>{listener.nickname}</span>
                    {listener.verified && <span className={styles.verified}>هویت تأیید شده</span>}
                  </span>
                  <span className={styles.meta}>نزدیک‌ترین زمان: {faDate(listener.nextAvailableAt, timeZone)}</span>
                  <span className={styles.meta}>{listener.languages.map((item) => item.nameFa || item.nameEn || item.code).join(' · ')}</span>
                  <span className={styles.meta}>
                    {listener.ratingAverage === null
                      ? 'هنوز امتیازی ثبت نشده'
                      : `امتیاز ${listener.ratingAverage.toFixed(1)} از ۵ · ${fa(listener.ratingCount)} نظر`}
                    {listener.completedCalls > 0 ? ` · ${fa(listener.completedCalls)} گفت‌وگوی انجام‌شده` : ''}
                  </span>
                  {listener.listeningStyle && (
                    <span className={styles.styleText}>
                      شیوه شنیدن: {listener.listeningStyle}
                      <small>این توضیح را خود شنونده نوشته و توسط یکی هست راستی‌آزمایی نشده است.</small>
                    </span>
                  )}
                  {listener.shortIntro && (
                    <span className={styles.intro}>
                      {listener.shortIntro}
                      <small>این معرفی را خود شنونده نوشته است.</small>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section className={styles.card}>
            <div>
              <p className={styles.eyebrow}>رزرو با {selected.nickname}</p>
              <h2 className={styles.heading}>روز و ساعت را انتخاب کن</h2>
            </div>
            {availability.length === 0 ? (
              <p className={styles.empty}>بازه آزادی برای این شنونده باقی نمانده است.</p>
            ) : (
              <>
                <div className={styles.field}>
                  <span>بازه‌های آزاد</span>
                  <div className={styles.row}>
                    {availability.map((window) => (
                      <button
                        key={window.id}
                        type="button"
                        disabled={busy}
                        className={`${styles.pill} ${availabilityId === window.id ? styles.pillActive : ''}`}
                        onClick={() => chooseWindow(window)}
                      >
                        {faDate(window.startsAt, timeZone)} تا {faDate(window.endsAt, timeZone)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className={styles.field}>
                  <span>شروع گفت‌وگو · به وقت {timeZone || 'دستگاه شما'}</span>
                  <input
                    className={styles.control}
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(event) => setScheduledLocal(event.target.value)}
                  />
                </label>

                <div className={styles.field}>
                  <span>مدت گفت‌وگو</span>
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

                <label className={styles.field}>
                  <span>زبان گفت‌وگو</span>
                  <select className={styles.control} value={languageCode} onChange={(event) => setLanguageCode(event.target.value)}>
                    {selected.languages.map((language) => (
                      <option key={language.code} value={language.code}>{language.nameFa || language.nameEn || language.code}</option>
                    ))}
                  </select>
                </label>

                {selectedWindow?.busy.length ? (
                  <div className={styles.notice}>
                    زمان‌هایی که در این بازه قبلاً گرفته شده‌اند: {selectedWindow.busy.map((item) => `${faDate(item.startsAt, timeZone)} تا ${faDate(item.endsAt, timeZone)}`).join('، ')}
                  </div>
                ) : null}

                <CallCostQuote maxSeconds={maxSeconds} deferred className={styles.trustNote} />

                <div className={styles.bookingConsent}>
                  <p>این رزرو برای یک گفت‌وگوی محترمانه با شنونده است. سرویس جای اورژانس یا خدمات تخصصی پزشکی، روان‌شناسی و حقوقی نیست و اطلاعات تماس شخصی نباید ردوبدل شود.</p>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />
                    <span>تأیید می‌کنم شرایط سنی استفاده از سرویس را دارم.</span>
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                    <span><a href="/terms">قواعد استفاده</a> را خوانده‌ام و می‌پذیرم.</span>
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={safetyAccepted} onChange={(event) => setSafetyAccepted(event.target.checked)} />
                    <span>مرزهای ایمنی، احترام و عدم تبادل اطلاعات تماس شخصی را می‌پذیرم.</span>
                  </label>
                </div>

                <button
                  type="button"
                  disabled={busy || !policiesReady || !clientTimeFits()}
                  className={styles.primary}
                  onClick={() => void createReservation()}
                >
                  {busy ? 'در حال ثبت…' : 'ثبت این زمان'}
                </button>
                {!policiesReady && <p className={styles.helper}>برای ثبت رزرو، سه تأیید بالا لازم است.</p>}
                {!clientTimeFits() && scheduledLocal && <p className={styles.helper}>زمان انتخاب‌شده باید کامل داخل یکی از بازه‌های آزاد باشد و با رزرو دیگری تداخل نداشته باشد.</p>}
              </>
            )}
          </section>
        )}

        <section className={styles.card}>
          <div>
            <p className={styles.eyebrow}>برنامه من</p>
            <h2 className={styles.heading}>رزروهای من</h2>
            <p className={styles.helper}>تا وقتی رزرو شروع نشده، می‌توانی آن را از همین بخش لغو کنی.</p>
          </div>
          {bookings.length === 0 ? (
            <p className={styles.empty}>هنوز رزروی ثبت نشده است.</p>
          ) : bookings.map((booking) => (
            <article key={booking.id} className={styles.booking}>
              <div className={styles.bookingTopline}>
                <strong>{booking.listenerNickname}</strong>
                <span className={`${styles.status} ${booking.status === 'cancelled' || booking.status === 'missed' ? styles.statusMuted : ''}`}>
                  {bookingStatus(booking.status)}
                </span>
              </div>
              <span className={styles.meta}>{faDate(booking.scheduledAt, timeZone)}</span>
              <span className={styles.meta}>{fa(booking.maxBillableSeconds / 60)} دقیقه · {languageName(booking.languageCode, knownLanguages)}</span>
              {booking.status === 'booked' && (
                <div className={styles.row}>
                  <a className={styles.primaryLink} href={`/booking/call?bookingId=${encodeURIComponent(booking.id)}`}>ورود به گفت‌وگو</a>
                  <button type="button" disabled={busy} className={styles.danger} onClick={() => void cancelReservation(booking.id)}>لغو رزرو</button>
                </div>
              )}
              {booking.status === 'initiated' && booking.callId && (
                <a className={styles.primaryLink} href={`/booking/call?callId=${encodeURIComponent(booking.callId)}`}>ادامه گفت‌وگو</a>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
