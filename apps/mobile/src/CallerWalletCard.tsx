import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  createWalletTopup,
  getBootstrap,
  getErrorCode,
  getWallet,
  getWalletTopup,
  getWalletTransactions,
  verifyWalletTopup,
  type BootstrapResponse,
  type WalletResponse,
  type WalletTopupResponse,
  type WalletTransactionsResponse,
} from './api';
import { isPaymentEnabled } from './env.ts';

type Props = { token: string };

// W86: fixed for the lifetime of the process (EXPO_PUBLIC_APP_ENV is baked
// in at build time), so this is resolved once rather than re-checked per render.
const PAYMENT_ENABLED = isPaymentEnabled();

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
    const sign = amount < 0n ? '-' : '';
    const absolute = amount < 0n ? -amount : amount;
    const unit = BigInt(Math.max(1, Math.trunc(divisor)));
    const whole = absolute / unit;
    const remainder = absolute % unit;
    if (remainder === 0n) return `${sign}${whole.toLocaleString('fa-IR')}`;
    const fraction = remainder.toString().padStart(unit.toString().length - 1, '0').replace(/0+$/, '');
    return `${sign}${whole.toLocaleString('fa-IR')}.${fraction}`;
  } catch {
    return value;
  }
}

function transactionLabel(type: string): string {
  if (type === 'payment_topup') return 'شارژ کیف پول';
  if (type === 'call_charge') return 'هزینه تماس';
  if (type === 'refund') return 'برگشت وجه';
  if (type === 'adjustment') return 'اصلاح کیف پول';
  return 'تراکنش کیف پول';
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    invalid_amount: 'مبلغ شارژ معتبر نیست.',
    payment_not_configured: 'درگاه پرداخت هنوز برای این محیط فعال نشده است.',
    payment_provider_unavailable: 'نتیجه ساخت پرداخت قطعی نشد. برای جلوگیری از پرداخت تکراری، تلاش بعدی همین درخواست را ادامه می‌دهد.',
    payment_initializing: 'همین درخواست شارژ هنوز در حال تعیین تکلیف است؛ درخواست تازه‌ای ساخته نمی‌شود.',
    payment_verification_unavailable: 'بررسی پرداخت موقتاً در دسترس نیست.',
    payment_not_ready_for_verification: 'پرداخت هنوز آماده بررسی نیست.',
    unauthorized: 'نشست ورود معتبر نیست.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'عملیات کیف پول انجام نشد.';
}

export default function CallerWalletCard({ token }: Props) {
  const [wallets, setWallets] = useState<WalletResponse['wallets']>([]);
  const [transactions, setTransactions] = useState<WalletTransactionsResponse['transactions']>([]);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [amountText, setAmountText] = useState('');
  const [attempt, setAttempt] = useState<WalletTopupResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const topupKeyRef = useRef<{ amountMinor: string; key: string } | null>(null);

  const wallet = useMemo(() => wallets.find((item) => item.currencyCode === 'IRR') ?? null, [wallets]);
  const divisor = bootstrap?.pricing.displayDivisor ?? 1;
  const displayUnit = bootstrap?.pricing.displayUnit ?? 'IRR';

  async function refreshWalletState() {
    const [walletValue, transactionValue] = await Promise.all([
      getWallet(token),
      getWalletTransactions(token, 'IRR', 5),
    ]);
    setWallets(walletValue.wallets);
    setTransactions(transactionValue.transactions);
  }

  useEffect(() => {
    let disposed = false;
    Promise.all([getWallet(token), getWalletTransactions(token, 'IRR', 5), getBootstrap()])
      .then(([walletValue, transactionValue, bootstrapValue]) => {
        if (disposed) return;
        setWallets(walletValue.wallets);
        setTransactions(transactionValue.transactions);
        setBootstrap(bootstrapValue);
      })
      .catch((cause) => {
        if (!disposed) setError(messageFor(getErrorCode(cause)));
      });
    return () => { disposed = true; };
  }, [token]);

  useEffect(() => {
    if (!attempt?.attemptId || attempt.status !== 'pending') return;
    const attemptId = attempt.attemptId;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      Promise.all([
        getWalletTopup(token, attemptId),
        getWallet(token),
        getWalletTransactions(token, 'IRR', 5),
      ])
        .then(([latestAttempt, walletValue, transactionValue]) => {
          setAttempt(latestAttempt);
          setWallets(walletValue.wallets);
          setTransactions(transactionValue.transactions);
          if (latestAttempt.status === 'succeeded') {
            setAmountText('');
            topupKeyRef.current = null;
          }
        })
        .catch((cause) => setError(messageFor(getErrorCode(cause))));
    });
    return () => subscription.remove();
  }, [token, attempt?.attemptId, attempt?.status]);

  function changeAmount(value: string) {
    const normalized = normalizeDigits(value).slice(0, 15);
    if (normalized !== amountText) {
      topupKeyRef.current = null;
      setAttempt(null);
    }
    setAmountText(normalized);
  }

  async function startTopup() {
    // W86: Closed-Test builds must never open a live payment checkout --
    // this is a fail-closed guard in addition to the UI below not rendering
    // the topup controls in that build at all (see PAYMENT_ENABLED usage).
    if (busy || !PAYMENT_ENABLED) return;
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
    const amountMinorText = amountMinor.toString();
    if (!topupKeyRef.current || topupKeyRef.current.amountMinor !== amountMinorText) {
      topupKeyRef.current = {
        amountMinor: amountMinorText,
        key: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      };
    }

    setBusy(true);
    setError('');
    try {
      const created = await createWalletTopup(
        token,
        amountMinorText,
        topupKeyRef.current.key,
      );
      setAttempt(created);
      if (created.status !== 'pending') topupKeyRef.current = null;
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
      await refreshWalletState();
      if (result.status === 'succeeded') {
        setAmountText('');
        topupKeyRef.current = null;
      }
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
        <TouchableOpacity disabled={busy} onPress={() => refreshWalletState().catch((cause) => setError(messageFor(getErrorCode(cause))))}>
          <Text style={styles.link}>به‌روزرسانی</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.balance}>{formatMinor(availableMinor, divisor)} {displayUnit}</Text>
      {reservedMinor !== '0' && (
        <Text style={styles.helper}>رزرو تماس جاری: {formatMinor(reservedMinor, divisor)} {displayUnit}</Text>
      )}

      {PAYMENT_ENABLED ? (
        <>
          <Text style={styles.label}>مبلغ شارژ ({displayUnit})</Text>
          <TextInput
            keyboardType="number-pad"
            value={amountText}
            onChangeText={changeAmount}
            placeholder="مثلاً ۱۰۰۰۰۰"
            style={styles.input}
            textAlign="right"
          />
          <TouchableOpacity disabled={busy || !amountText} onPress={startTopup} style={[styles.primary, (busy || !amountText) && styles.disabled]}>
            <Text style={styles.primaryText}>{busy ? 'در حال بررسی…' : 'شارژ کیف پول'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.helper}>شارژ واقعی کیف پول در این نسخه آزمایشی (Closed Test) غیرفعال است؛ اعتبار تست توسط تیم اختصاص داده می‌شود.</Text>
      )}

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

      <View style={styles.history}>
        <Text style={styles.label}>آخرین تراکنش‌ها</Text>
        {transactions.map((transaction) => (
          <View key={transaction.id} style={styles.transactionRow}>
            <View style={styles.transactionText}>
              <Text style={styles.transactionLabel}>{transactionLabel(transaction.type)}</Text>
              <Text style={styles.helper}>{new Date(transaction.createdAt).toLocaleString('fa-IR')}</Text>
            </View>
            <Text style={styles.transactionAmount}>{formatMinor(transaction.deltaMinor, divisor)} {displayUnit}</Text>
          </View>
        ))}
        {!transactions.length && <Text style={styles.helper}>هنوز تراکنشی ثبت نشده است.</Text>}
      </View>

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
  history: { borderTopWidth: 1, borderTopColor: '#EEE9E2', paddingTop: 12, gap: 9 },
  transactionRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  transactionText: { flex: 1 },
  transactionLabel: { textAlign: 'right', fontWeight: '700', fontSize: 13 },
  transactionAmount: { fontWeight: '800', fontSize: 13 },
  error: { color: '#9E2525', textAlign: 'right', lineHeight: 20 },
  disabled: { opacity: 0.35 },
});
