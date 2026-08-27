import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getErrorCode,
  getListenerEarnings,
  type ListenerEarningStatus,
  type ListenerEarningsResponse,
} from './api';

type Props = { token: string };

const STATUSES: ListenerEarningStatus[] = ['pending', 'available', 'paid'];

function statusLabel(status: ListenerEarningStatus): string {
  if (status === 'pending') return 'در انتظار';
  if (status === 'available') return 'آماده تسویه';
  return 'پرداخت‌شده';
}

function formatMinor(value: string, currencyCode: string): string {
  const negative = value.startsWith('-');
  const digits = (negative ? value.slice(1) : value).replace(/^0+(?=\d)/, '') || '0';
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped} ${currencyCode}`;
}

function messageFor(code: string): string {
  if (code === 'unauthorized') return 'نشست ورود معتبر نیست. دوباره وارد شو.';
  if (code === 'network_error') return 'اطلاعات درآمد فعلاً در دسترس نیست.';
  return 'خواندن درآمدها انجام نشد.';
}

export default function ListenerEarningsCard({ token }: Props) {
  const [data, setData] = useState<ListenerEarningsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setData(await getListenerEarnings(token));
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [token]);

  const currencies = useMemo(
    () => [...new Set(data?.summary.map((row) => row.currencyCode) ?? [])],
    [data],
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <TouchableOpacity disabled={busy} onPress={refresh} style={[styles.refreshButton, busy && styles.disabled]}>
          <Text style={styles.refreshText}>{busy ? '…' : 'تازه‌سازی'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>درآمد من</Text>
      </View>

      {!data && !error && <Text style={styles.helper}>در حال خواندن درآمدها…</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      {data && currencies.length === 0 && (
        <Text style={styles.helper}>هنوز درآمدی برای این حساب ثبت نشده است.</Text>
      )}

      {data && currencies.map((currencyCode) => (
        <View key={currencyCode} style={styles.currencyBlock}>
          <Text style={styles.currencyTitle}>{currencyCode}</Text>
          {STATUSES.map((status) => {
            const row = data.summary.find((item) => item.currencyCode === currencyCode && item.status === status);
            return (
              <View key={status} style={styles.summaryRow}>
                <Text style={styles.amount}>{formatMinor(row?.amountMinor ?? '0', currencyCode)}</Text>
                <Text style={styles.status}>{statusLabel(status)} · {row?.earningCount ?? 0} مورد</Text>
              </View>
            );
          })}
        </View>
      ))}

      {!!data?.recent.length && (
        <View style={styles.recentBlock}>
          <Text style={styles.recentTitle}>آخرین درآمدها</Text>
          {data.recent.slice(0, 5).map((item, index) => (
            <View key={`${item.createdAt}-${index}`} style={styles.recentRow}>
              <Text style={styles.recentAmount}>{formatMinor(item.amountMinor, item.currencyCode)}</Text>
              <Text style={styles.recentMeta}>{statusLabel(item.status)} · {item.createdAt.slice(0, 10)}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.helper}>این بخش فقط وضعیت ثبت‌شده را نشان می‌دهد و هیچ پرداخت یا تغییر وضعیت مالی انجام نمی‌دهد.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#e2dfd7', borderRadius: 16, padding: 15, gap: 11, backgroundColor: '#faf9f6' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#20211f', textAlign: 'right', fontSize: 18, fontWeight: '800' },
  refreshButton: { borderWidth: 1, borderColor: '#d8d5cd', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11 },
  refreshText: { color: '#4b4c47', fontSize: 12, fontWeight: '700' },
  currencyBlock: { gap: 7, paddingTop: 3 },
  currencyTitle: { color: '#77766f', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  amount: { color: '#20211f', fontWeight: '800' },
  status: { color: '#565751', textAlign: 'right', flexShrink: 1 },
  recentBlock: { borderTopWidth: 1, borderTopColor: '#e2dfd7', paddingTop: 10, gap: 7 },
  recentTitle: { color: '#44453f', fontWeight: '800', textAlign: 'right' },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  recentAmount: { color: '#30312d', fontWeight: '700' },
  recentMeta: { color: '#77766f', fontSize: 12, textAlign: 'right', flexShrink: 1 },
  helper: { color: '#7a7972', textAlign: 'right', fontSize: 12, lineHeight: 20 },
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 10, padding: 10, lineHeight: 20 },
  disabled: { opacity: 0.4 },
});
