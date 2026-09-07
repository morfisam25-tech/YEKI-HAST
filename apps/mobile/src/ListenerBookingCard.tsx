import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  cancelListenerAvailability,
  createListenerAvailability,
  getBookingErrorCode,
  getListenerAvailability,
  getListenerBookings,
  type ListenerAvailability,
  type ListenerBooking,
} from './booking-api';

type Props = {
  token: string;
  acceptsMale: boolean;
  acceptsFemale: boolean;
};

const START_OFFSETS = [
  { seconds: 3600, label: '۱ ساعت دیگر' },
  { seconds: 3 * 3600, label: '۳ ساعت دیگر' },
  { seconds: 24 * 3600, label: 'فردا همین ساعت' },
] as const;
const DURATIONS = [
  { seconds: 3600, label: '۱ ساعت' },
  { seconds: 2 * 3600, label: '۲ ساعت' },
  { seconds: 3 * 3600, label: '۳ ساعت' },
] as const;

function faDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست.',
    listener_not_approved: 'حساب شنونده هنوز برای رزرو فعال نشده است.',
    invalid_availability_window: 'بازه زمانی معتبر نیست.',
    availability_overlap: 'این بازه با Availability دیگری تداخل دارد.',
    availability_has_reservations: 'این بازه رزرو فعال دارد و فعلاً قابل لغو نیست.',
    no_callers_accepted: 'حداقل یک گروه Caller باید فعال باشد.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات رزرو انجام نشد.';
}

function bookingStatus(status: ListenerBooking['status']): string {
  const labels: Record<ListenerBooking['status'], string> = {
    booked: 'رزرو شده',
    cancelled: 'لغو شده',
    initiated: 'تماس شروع شده',
    missed: 'از دست رفته',
  };
  return labels[status];
}

export default function ListenerBookingCard({ token, acceptsMale, acceptsFemale }: Props) {
  const [availability, setAvailability] = useState<ListenerAvailability[]>([]);
  const [bookings, setBookings] = useState<ListenerBooking[]>([]);
  const [startOffsetSeconds, setStartOffsetSeconds] = useState(3600);
  const [durationSeconds, setDurationSeconds] = useState(2 * 3600);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeAvailability = useMemo(
    () => availability.filter((item) => item.status === 'open' && Date.parse(item.endsAt) > Date.now()),
    [availability],
  );
  const upcomingBookings = useMemo(
    () => bookings.filter((item) => item.status === 'booked' || item.status === 'initiated'),
    [bookings],
  );

  async function refresh() {
    const [availabilityResult, bookingResult] = await Promise.all([
      getListenerAvailability(token),
      getListenerBookings(token),
    ]);
    setAvailability(availabilityResult.availability);
    setBookings(bookingResult.bookings);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(messageFor(getBookingErrorCode(cause))));
  }, [token]);

  async function addAvailability() {
    if (busy || (!acceptsMale && !acceptsFemale)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const startsAt = new Date(Date.now() + startOffsetSeconds * 1000);
      // Round to the next 5-minute boundary so the public slot is easy to read.
      startsAt.setSeconds(0, 0);
      startsAt.setMinutes(Math.ceil(startsAt.getMinutes() / 5) * 5);
      const endsAt = new Date(startsAt.getTime() + durationSeconds * 1000);
      await createListenerAvailability(token, {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        acceptsMale,
        acceptsFemale,
      });
      setNotice('بازه رزرو آینده ثبت شد.');
      await refresh();
    } catch (cause) {
      setError(messageFor(getBookingErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAvailability(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await cancelListenerAvailability(token, id);
      setNotice('بازه رزرو لغو شد.');
      await refresh();
    } catch (cause) {
      setError(messageFor(getBookingErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>رزرو آینده</Text>
        <TouchableOpacity disabled={busy} onPress={() => { void refresh(); }}>
          <Text style={styles.refresh}>به‌روزرسانی</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helper}>Availability آینده از Online بودن همین لحظه جداست. Caller فقط داخل بازه‌ای که خودت باز کرده‌ای می‌تواند زمان رزرو کند.</Text>

      <Text style={styles.label}>شروع بازه</Text>
      <View style={styles.row}>
        {START_OFFSETS.map((option) => (
          <TouchableOpacity
            key={option.seconds}
            disabled={busy}
            onPress={() => setStartOffsetSeconds(option.seconds)}
            style={[styles.choice, startOffsetSeconds === option.seconds && styles.selected, busy && styles.disabled]}
          >
            <Text style={styles.choiceText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>مدت بازبودن رزرو</Text>
      <View style={styles.row}>
        {DURATIONS.map((option) => (
          <TouchableOpacity
            key={option.seconds}
            disabled={busy}
            onPress={() => setDurationSeconds(option.seconds)}
            style={[styles.choice, durationSeconds === option.seconds && styles.selected, busy && styles.disabled]}
          >
            <Text style={styles.choiceText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.helper}>گروه Caller این بازه از تنظیم فعلی تو استفاده می‌کند: {acceptsFemale ? 'زن ✓ ' : ''}{acceptsMale ? 'مرد ✓' : ''}</Text>
      <TouchableOpacity
        disabled={busy || (!acceptsMale && !acceptsFemale)}
        onPress={() => { void addAvailability(); }}
        style={[styles.primary, (busy || (!acceptsMale && !acceptsFemale)) && styles.disabled]}
      >
        <Text style={styles.primaryText}>{busy ? 'در حال ثبت…' : 'ثبت Availability آینده'}</Text>
      </TouchableOpacity>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      <View style={styles.divider} />
      <Text style={styles.label}>بازه‌های باز</Text>
      {!activeAvailability.length && <Text style={styles.helper}>بازه آینده فعالی نداری.</Text>}
      {activeAvailability.map((item) => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.itemTitle}>{faDate(item.startsAt)} تا {faDate(item.endsAt)}</Text>
          <Text style={styles.helper}>{item.acceptsFemale ? 'زن ✓ ' : ''}{item.acceptsMale ? 'مرد ✓' : ''}</Text>
          <TouchableOpacity disabled={busy} onPress={() => { void cancelAvailability(item.id); }} style={[styles.cancel, busy && styles.disabled]}>
            <Text style={styles.cancelText}>لغو این بازه</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.divider} />
      <Text style={styles.label}>رزروهای نزدیک</Text>
      {!upcomingBookings.length && <Text style={styles.helper}>رزرو فعالی برای نمایش نیست.</Text>}
      {upcomingBookings.slice(0, 8).map((item) => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.itemTitle}>{faDate(item.scheduledAt)}</Text>
          <Text style={styles.helper}>{bookingStatus(item.status)} · {Math.round(item.maxBillableSeconds / 60).toLocaleString('fa-IR')} دقیقه · {item.languageCode}</Text>
          {item.status === 'booked' && <Text style={styles.helper}>در زمان رزرو، Work Mode را باز نگه دار تا تماس اینترنتی را دریافت کنی.</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f7f6f2', borderRadius: 18, padding: 16, gap: 11 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#20211f', textAlign: 'right', fontSize: 18, fontWeight: '800' },
  refresh: { color: '#5f6759', fontWeight: '700' },
  helper: { color: '#74736d', textAlign: 'right', fontSize: 12, lineHeight: 20 },
  label: { color: '#30312d', textAlign: 'right', fontWeight: '800' },
  row: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#d6d3ca', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff' },
  selected: { borderColor: '#677160', backgroundColor: '#e9eee5' },
  choiceText: { color: '#3f403b', fontWeight: '700', fontSize: 12 },
  primary: { backgroundColor: '#20211f', borderRadius: 12, padding: 13 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#ddd9d0', marginVertical: 3 },
  item: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 6 },
  itemTitle: { color: '#30312d', textAlign: 'right', fontWeight: '800', lineHeight: 22 },
  cancel: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#d9aaa4', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  cancelText: { color: '#8a3430', fontWeight: '700', fontSize: 12 },
  error: { color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 10, padding: 10, textAlign: 'right', lineHeight: 20 },
  notice: { color: '#4c5a48', backgroundColor: '#eaf2e6', borderRadius: 10, padding: 10, textAlign: 'right', lineHeight: 20 },
  disabled: { opacity: 0.4 },
});
