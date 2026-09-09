'use client';

import { useEffect, useState } from 'react';

export type CallQuoteBinding = {
  pricingPlanId: string;
  marketCode: string;
  enough: boolean;
  reservedAlready: boolean;
};

type QuoteResponse = {
  market: { code: string; countryCode: string; timezone: string };
  pricing: {
    pricingPlanId: string;
    currencyCode: string;
    callerRatePerMinuteMinor: number;
    billingIncrementSeconds: number | null;
    displayUnit: 'toman' | 'currency';
    displayDivisor: number;
  };
  listenerBase: {
    currencyCode: string;
    ratePerMinuteMinor: number;
    callerCountryIndependent: true;
  };
  session: {
    maxBillableSeconds: number;
    authorizedMinor: string;
    reservedAlready: boolean;
  };
  wallet: {
    currencyCode: string;
    balanceMinor: string;
    reservedMinor: string;
    availableMinor: string;
    enough: boolean;
  };
};

type Props = {
  maxSeconds?: number | null;
  bookingId?: string;
  callId?: string;
  deferred?: boolean;
  className?: string;
  onQuoteChange?: (quote: CallQuoteBinding | null) => void;
};

function formatMinor(amountMinor: bigint, pricing: QuoteResponse['pricing']): string {
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
    return formatter.format(Number(amountMinor) / 10 ** digits);
  } catch {
    return `${amountMinor.toString()} ${pricing.currencyCode}`;
  }
}

export default function CallCostQuote({
  maxSeconds = null,
  bookingId = '',
  callId = '',
  deferred = false,
  className,
  onQuoteChange,
}: Props) {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setUnavailable(false);
      onQuoteChange?.(null);
      try {
        const params = new URLSearchParams();
        if (maxSeconds !== null) params.set('maxSeconds', String(maxSeconds));
        else if (bookingId) params.set('bookingId', bookingId);
        else if (callId) params.set('callId', callId);
        else throw new Error('quote_target_missing');

        const response = await fetch(`/api/caller/caller/quote?${params.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null) as (QuoteResponse & { error?: string }) | null;
        if (!response.ok || !payload) throw new Error(payload?.error || `http_${response.status}`);
        if (!active) return;
        setQuote(payload);
        onQuoteChange?.({
          pricingPlanId: payload.pricing.pricingPlanId,
          marketCode: payload.market.code,
          enough: payload.wallet.enough,
          reservedAlready: payload.session.reservedAlready,
        });
      } catch {
        if (active) {
          setQuote(null);
          setUnavailable(true);
          onQuoteChange?.(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [bookingId, callId, maxSeconds, onQuoteChange]);

  const pricing = quote?.pricing;
  const seconds = quote?.session.maxBillableSeconds ?? 0;
  const rateText = quote && pricing ? formatMinor(BigInt(pricing.callerRatePerMinuteMinor), pricing) : '';
  const holdText = quote && pricing ? formatMinor(BigInt(quote.session.authorizedMinor), pricing) : '';
  const availableText = quote && pricing ? formatMinor(BigInt(quote.wallet.availableMinor), pricing) : '';

  return (
    <div className={className} role="status" aria-live="polite" aria-atomic="true">
      {loading && <span>در حال بررسی نرخ و اعتبار…</span>}
      {!loading && quote && pricing && (
        <>
          <strong>نرخ این گفت‌وگو: {rateText} برای هر دقیقه اتصال واقعی.</strong>
          {quote.session.reservedAlready ? (
            <span>
              این تماس قبلاً ایجاد شده و تا {holdText} برای سقف {new Intl.NumberFormat('fa-IR').format(seconds / 60)} دقیقه رزرو شده است. مبلغ نهایی فقط بر اساس زمان اتصال واقعی کم می‌شود و باقی اعتبار آزاد می‌شود.
            </span>
          ) : deferred ? (
            <span>
              با نرخ فعلی، سقف {new Intl.NumberFormat('fa-IR').format(seconds / 60)} دقیقه به حداکثر {holdText} اعتبار نیاز دارد. ثبت رزرو الآن مبلغی نگه نمی‌دارد؛ نرخ و موجودی هنگام شروع تماس دوباره روی سرور بررسی می‌شود.
            </span>
          ) : (
            <span>
              برای سقف {new Intl.NumberFormat('fa-IR').format(seconds / 60)} دقیقه، تا {holdText} از اعتبار هنگام شروع تماس رزرو می‌شود؛ فقط زمان اتصال واقعی کم می‌شود و باقی اعتبار آزاد می‌شود.
            </span>
          )}
          <span>اعتبار قابل استفاده الآن: {availableText}.</span>
          {!quote.wallet.enough && !quote.session.reservedAlready && (
            <span>اعتبار فعلی برای این سقف زمانی کافی نیست؛ سقف کوتاه‌تر انتخاب کن یا اعتبارت را افزایش بده.</span>
          )}
          {bookingId && <span>رزرو به‌تنهایی پولی نگه نمی‌دارد؛ همین بازار و نرخ هنگام شروع تماس دوباره روی سرور تأیید می‌شود.</span>}
        </>
      )}
      {!loading && unavailable && (
        <span>برآورد هزینه فعلاً در دسترس نیست. تا بازار و نرخ معتبر روی سرور تأیید نشود، تماس شروع نمی‌شود.</span>
      )}
    </div>
  );
}
