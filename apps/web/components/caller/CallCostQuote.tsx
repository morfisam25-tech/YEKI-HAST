'use client';

import { useEffect, useState } from 'react';

type Bootstrap = {
  pricing: {
    currencyCode: string;
    callerRatePerMinuteMinor: number;
    billingIncrementSeconds: number;
    displayUnit: 'toman' | 'currency';
    displayDivisor: number;
  };
};

type WalletResponse = {
  wallets: Array<{
    currencyCode: string;
    balanceMinor: string;
    reservedMinor: string;
    availableMinor: string;
  }>;
};

type BookingResponse = {
  bookings: Array<{
    id: string;
    maxBillableSeconds: number;
  }>;
};

type Props = {
  maxSeconds?: number | null;
  bookingId?: string;
  deferred?: boolean;
  className?: string;
};

type Quote = {
  rateText: string;
  holdText: string;
  availableText: string;
  enough: boolean;
  seconds: number;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api/caller/${path}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || `http_${response.status}`);
  return payload;
}

function formatMinor(amountMinor: bigint, pricing: Bootstrap['pricing']): string {
  if (pricing.displayUnit === 'toman') {
    const divisor = BigInt(Math.max(1, Math.trunc(pricing.displayDivisor || 10)));
    const whole = amountMinor / divisor;
    const remainder = amountMinor % divisor;
    const value = Number(whole) + Number(remainder) / Number(divisor);
    return `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value)} تومان`;
  }

  try {
    const formatter = new Intl.NumberFormat('fa-IR', {
      style: 'currency',
      currency: pricing.currencyCode,
      currencyDisplay: 'code',
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits;
    const divisor = 10 ** digits;
    return formatter.format(Number(amountMinor) / divisor);
  } catch {
    return `${amountMinor.toString()} ${pricing.currencyCode}`;
  }
}

export default function CallCostQuote({ maxSeconds = null, bookingId = '', deferred = false, className }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setUnavailable(false);
      try {
        const [bootstrap, walletResponse, bookingResponse] = await Promise.all([
          getJson<Bootstrap>('bootstrap'),
          getJson<WalletResponse>('wallet'),
          maxSeconds === null && bookingId
            ? getJson<BookingResponse>('bookings')
            : Promise.resolve<BookingResponse>({ bookings: [] }),
        ]);
        if (!active) return;

        const seconds = maxSeconds
          ?? bookingResponse.bookings.find((item) => item.id === bookingId)?.maxBillableSeconds
          ?? 0;
        if (!Number.isInteger(seconds) || seconds <= 0) {
          setQuote(null);
          setUnavailable(true);
          return;
        }

        const rate = BigInt(bootstrap.pricing.callerRatePerMinuteMinor);
        const hold = (rate * BigInt(seconds) + 59n) / 60n;
        const wallet = walletResponse.wallets.find((item) => item.currencyCode === bootstrap.pricing.currencyCode);
        const available = BigInt(wallet?.availableMinor ?? '0');

        setQuote({
          rateText: formatMinor(rate, bootstrap.pricing),
          holdText: formatMinor(hold, bootstrap.pricing),
          availableText: formatMinor(available, bootstrap.pricing),
          enough: available >= hold,
          seconds,
        });
      } catch {
        if (active) {
          setQuote(null);
          setUnavailable(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [bookingId, maxSeconds]);

  return (
    <div className={className} role="status" aria-live="polite" aria-atomic="true">
      {loading && <span>در حال بررسی نرخ و اعتبار…</span>}
      {!loading && quote && (
        <>
          <strong>نرخ فعلی: {quote.rateText} برای هر دقیقه اتصال واقعی.</strong>
          {deferred ? (
            <span>
              با نرخ فعلی، سقف {new Intl.NumberFormat('fa-IR').format(quote.seconds / 60)} دقیقه به حداکثر {quote.holdText} اعتبار نیاز دارد. ثبت رزرو الآن مبلغی نگه نمی‌دارد؛ نرخ و موجودی هنگام شروع تماس دوباره روی سرور بررسی می‌شود.
            </span>
          ) : (
            <span>
              برای سقف {new Intl.NumberFormat('fa-IR').format(quote.seconds / 60)} دقیقه، تا {quote.holdText} از اعتبار هنگام شروع تماس رزرو می‌شود؛ فقط زمان اتصال واقعی کم می‌شود و باقی اعتبار آزاد می‌شود.
            </span>
          )}
          <span>اعتبار قابل استفاده الآن: {quote.availableText}.</span>
          {!quote.enough && <span>اعتبار فعلی برای این سقف زمانی کافی نیست؛ سقف کوتاه‌تر انتخاب کن یا اعتبارت را افزایش بده.</span>}
          {bookingId && <span>رزرو به‌تنهایی پولی نگه نمی‌دارد؛ همین نرخ و موجودی با شروع تماس دوباره تأیید می‌شود.</span>}
        </>
      )}
      {!loading && unavailable && (
        <span>برآورد هزینه فعلاً در دسترس نیست. شروع تماس بدون تأیید نرخ و اعتبار روی سرور انجام نمی‌شود.</span>
      )}
    </div>
  );
}
