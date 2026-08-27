import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  createWalletTopup,
  getBootstrap,
  getErrorCode,
  getWallet,
  verifyWalletTopup,
  type BootstrapResponse,
  type WalletResponse,
  type WalletTopupResponse,
} from './api';

type Props = { token: string };

function normalizeDigits(value: string): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return value
    .replace(/[۰-۹]/g, (char) => String(fa.indexOf(char)))
    .replace(/[٠-٩]/g, (char) => String(ar.indexOf(char)))
    .replace(/\D/g, '');
}

function formatMinor(value: string, divisor: number): string {
  try {
    const amount = BigInt(value);
    const unit = BigInt(Math.max(1, Math.trunc(divisor)));
    const whole = amount / unit;
    const remainder = amount % unit;
    if (remainder === 0n) return whole.toLocaleString('fa-IR');
    const fraction = remainder.toString().padStart(unit.toString().length - 1, '0').replace(/0+$/, '');
    return `${whole.toLocaleString('fa-IR')}.${fraction}`;
  } catch {
    return value;
  }
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    invalid_amount: 'مبلغ شارژ معتبر نیست.',
    payment_not_configured: 'درگاه پرداخت هنوز برای این محیط فعال نشده است.',
    payment_provider_unavailable: 'ارتباط با درگاه پرداخت قطعی نشد. دوباره همین پرداخت را نساز؛ کمی بعد وضعیت را بررسی کن.',
    payment_initializing: 'این درخواست شارژ هنوز در حال آماده‌شدن است.',
    payment_verification_unavailable: 'بررسی پرداخت موقتاً در دسترس نیست.',
    payment_not_ready_for_verification: 'پرداخت هنوز آماده بررسی نیست.',
    unauthorized: 'نشست ورود معتبر نیست.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات کیف پول انجام نشد.';
}

export default function CallerWalletCard({ token }: Props) {
  const [wallets, setWallets] = useState<WalletResponse['wallets']>([]);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [amountText, setAmountText] = useState('');
  const [attempt, setAttempt] = useState<WalletTopupResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const wallet = useMemo(() => wallets.find((item) => item.currencyCode === 'IRR') ?? null, [wallets]);
  const divisor = bootstrap?.pricing.displayDivisor ?? 1;
  const displayUnit = bootstrap?.pricing.displayUnit ?? 'IRR';

  async function refreshWallet() {
    const value = await getWallet(token);
    setWallets(value.wallets);
  }

  useEffect(() => {
    let disposed = false;
    Promise.all([getWallet(token), getBootstrap()])
      .then(([walletValue, bootstrapValue]) => {
        if (disposed) return;
        setWallets(walletValue.wallets);
        setBootstrap(bootstrapValue);
      })
      .catch((cause) => {
        if (!disposed) setError(messageFor(getErrorCode(cause)));
      });
    return () => { disposed = true; };
  }, [token]);

  async function startTopup() {
    if (busy) return;
    const normalized = normalizeDigits(amountText);
    if (!normalized || normalized === '0') {
      setError(messageFor('invalid_amount'));
      return;
    }

    let amountMinor: bigint;
    try {
      amountMinor = BigInt(normalized) * BigInt(Math.max(1, Math.trunc(divisor)));
    } catch {
      setError(messageFor('invalid_amount'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      const created = await createWalletTopup(
        token,
        amountMinor.toString(),
        `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      );
      setAttempt(created);
      if (created.paymentUrl) await Linking.openURL(created.paymentUrl);
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function checkPayment() {
    if (!attempt?.attemptId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await verifyWalletTopup(token, attempt.attemptId);
      setAttempt((current) => current ? { ...current, ...result } : result);
      await refreshWallet();
      if (result.status === 'succeeded') setAmountText('');
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  const availableMinor = wallet?.availableMinor ?? '0';
  const reservedMinor = wallet?.reservedMinor ?? '0';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>کیف پول</Text>
        <TouchableOpacity disabled={busy} onPress={() => refreshWallet().catch((cause) => setError(messageFor(getErrorCode(cause))))}>
          <Text style={styles.link}>به‌روزرسانی</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.balance}>{formatMinor(availableMinor, divisor)} {displayUnit}</Text>
      {reservedMinor !== '0' && (
        <Text style={styles.helper}>رزرو تماس جاری: {formatMinor(reservedMinor, divisor)} {displayUnit}</Text>
      )}

      <Text style={styles.label}>مبلغ شارژ ({displayUnit})</Text>
      <TextInput
        keyboardType="number-pad"
        value={amountText}
        onChangeText={(value) => setAmountText(normalizeDigits(value).slice(0, 15))}
        placeholder="مثلاً ۱۰۰۰۰۰"
        style={styles.input}
        textAlign="right"
      />
      <TouchableOpacity disabled={busy || !amountText} onPress={startTopup} style={[styles.primary, (busy || !amountText) && styles.disabled]}>
        <Text style={styles.primaryText}>{busy ? 'در حال بررسی…' : 'شارژ کیف پول'}</Text>
      </TouchableOpacity>

      {!!attempt && (
        <View style={styles.attemptBox}>
          <Text style={styles.helper}>وضعیت آخرین پرداخت: {attempt.status}</Text>
          {attempt.status === 'pending' && (
            <TouchableOpacity disabled={busy} onPress={checkPayment}>
              <Text style={styles.link}>بررسی پرداخت</Text>
            </TouchableOpacity>
          )}
          {attempt.status === 'succeeded' && <Text style={styles.success}>شارژ با موفقیت به کیف پول اضافه شد.</Text>}
        </View>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#E7E2DA', borderRadius: 18, padding: 18, gap: 11, backgroundColor: '#fff' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  balance: { fontSize: 25, fontWeight: '800', textAlign: 'right' },
  label: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  helper: { fontSize: 12, lineHeight: 20, textAlign: 'right', opacity: 0.65 },
  input: { borderWidth: 1, borderColor: '#DEDAD2', borderRadius: 12, padding: 12, fontSize: 16 },
  primary: { backgroundColor: '#171717', borderRadius: 12, padding: 13 },
  primaryText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  link: { textDecorationLine: 'underline', paddingVertical: 5, fontWeight: '600' },
  attemptBox: { backgroundColor: '#F7F5F0', borderRadius: 12, padding: 11, gap: 5 },
  success: { color: '#315C38', textAlign: 'right', fontWeight: '700' },
  error: { color: '#9E2525', textAlign: 'right', lineHeight: 20 },
  disabled: { opacity: 0.35 },
});
