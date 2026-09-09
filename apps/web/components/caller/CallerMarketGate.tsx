'use client';

import { useEffect, useMemo, useState } from 'react';

type Market = {
  id: string;
  code: string;
  countryCode: string;
  timezone: string;
  currencyCode?: string;
  configured?: boolean;
};

type MarketResponse = {
  currentMarket: Market | null;
  availableMarkets: Market[];
};

type Props = {
  className?: string;
};

function marketLabel(market: Market): string {
  try {
    const region = new Intl.DisplayNames(['fa'], { type: 'region' }).of(market.countryCode.toUpperCase());
    return `${region ?? market.countryCode} · ${market.currencyCode ?? ''}`.replace(/ · $/, '');
  } catch {
    return `${market.countryCode}${market.currencyCode ? ` · ${market.currencyCode}` : ''}`;
  }
}

export default function CallerMarketGate({ className }: Props) {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [selectedCode, setSelectedCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/caller/caller/market', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (MarketResponse & { error?: string }) | null;
        if (!response.ok || !payload) throw new Error(payload?.error || `http_${response.status}`);
        if (!active) return;
        setData(payload);
        setSelectedCode(payload.currentMarket?.code ?? payload.availableMarkets[0]?.code ?? '');
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error && cause.message === 'authentication_required'
          ? 'برای انتخاب بازار ابتدا وارد حساب شو.'
          : 'بازارهای قابل استفاده فعلاً در دسترس نیستند.');
      });
    return () => { active = false; };
  }, []);

  const currentLabel = useMemo(() => data?.currentMarket ? marketLabel(data.currentMarket) : '', [data]);

  async function save() {
    if (!selectedCode || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/caller/caller/market', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ marketCode: selectedCode }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `http_${response.status}`);
      window.location.reload();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'market_failed';
      if (code === 'caller_market_change_blocked') {
        setError('تا وقتی تماس فعال یا رزرو باز داری، بازار حساب قابل تغییر نیست.');
      } else if (code === 'caller_market_pricebook_unavailable') {
        setError('برای این بازار هنوز نرخ فعال روی سرور ثبت نشده است.');
      } else {
        setError('تغییر بازار حساب انجام نشد. دوباره تلاش کن.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className={className} role="alert">{error}</div>;
  if (!data) return <div className={className} role="status">در حال بررسی بازار حساب…</div>;

  return (
    <section className={className} aria-label="بازار و ارز گفت‌وگو">
      <p>
        بازار حساب، نرخ و ارز تماس را تعیین می‌کند. این انتخاب از موقعیت اینترنتی حدس زده نمی‌شود و فقط بازارهایی نمایش داده می‌شوند که نرخ فعال روی سرور دارند.
      </p>
      {data.currentMarket ? <p>بازار فعلی: <strong>{currentLabel}</strong></p> : <p>برای دیدن نرخ و شروع تماس، بازار حسابت را انتخاب کن.</p>}
      <label>
        <span>بازار حساب</span>
        <select value={selectedCode} disabled={busy} onChange={(event) => setSelectedCode(event.target.value)}>
          {data.availableMarkets.map((market) => (
            <option key={market.id} value={market.code}>{marketLabel(market)}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !selectedCode || selectedCode === data.currentMarket?.code}
        onClick={() => void save()}
      >
        {busy ? 'در حال ذخیره…' : data.currentMarket ? 'ثبت تغییر بازار' : 'ثبت بازار حساب'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
