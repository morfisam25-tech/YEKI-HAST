'use client';

import { useState, type FormEvent } from 'react';

const REPORT_REASONS = [
  { value: 'sexual_behavior', label: 'رفتار یا محتوای جنسی نامناسب' },
  { value: 'harassment', label: 'آزار یا مزاحمت' },
  { value: 'insult', label: 'توهین' },
  { value: 'threat', label: 'تهدید' },
  { value: 'off_platform_request', label: 'درخواست ارتباط خارج از سرویس' },
  { value: 'privacy_violation', label: 'نقض حریم خصوصی' },
  { value: 'scam', label: 'کلاهبرداری یا درخواست مشکوک' },
  { value: 'unsafe_advice', label: 'توصیه خطرناک یا خارج از نقش' },
  { value: 'inappropriate_conduct', label: 'رفتار نامناسب دیگر' },
  { value: 'technical_problem', label: 'مشکل فنی' },
  { value: 'other', label: 'مورد دیگر' },
] as const;

type ReportCategory = typeof REPORT_REASONS[number]['value'];

type Props = {
  callId: string;
  ended?: boolean;
};

function errorMessage(code: string): string {
  if (code === 'authentication_required') return 'برای ثبت گزارش باید وارد حساب باشی.';
  if (code === 'details_too_long') return 'توضیح گزارش بیش از حد طولانی است.';
  if (code === 'invalid_report_category') return 'یک دلیل معتبر برای گزارش انتخاب کن.';
  if (code === 'call_not_found' || code === 'not_call_participant') return 'این گزارش برای این گفت‌وگو قابل ثبت نیست.';
  return 'گزارش ثبت نشد. دوباره تلاش کن.';
}

export default function ListenerReportPanel({ callId, ended = false }: Props) {
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [details, setDetails] = useState('');
  const [blockCounterparty, setBlockCounterparty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/listener/safety/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          callId,
          category,
          details: details.trim() || undefined,
          blockCounterparty,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string; blocked?: boolean } | null;
      if (!response.ok) throw new Error(result?.error || `http_${response.status}`);
      setNotice(result?.blocked ? 'گزارش ثبت شد و این کاربر مسدود شد.' : 'گزارش ثبت شد.');
      setCategory('');
      setDetails('');
      setBlockCounterparty(false);
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : 'report_failed'));
    } finally {
      setBusy(false);
    }
  }

  const categoryId = `listener-report-category-${callId}`;
  const detailsId = `listener-report-details-${callId}`;
  const blockId = `listener-report-block-${callId}`;

  return (
    <details>
      <summary>
        <span>گزارش رفتار</span>
        <small>{ended ? 'بعد از پایان گفت‌وگو' : 'بدون پایان خودکار گفت‌وگو'}</small>
      </summary>
      <p>
        {ended
          ? 'اگر لازم است، رفتار این کاربر را برای همین گفت‌وگو ثبت کن.'
          : 'گزارش، گفت‌وگو را خودکار پایان نمی‌دهد. برای خروج فوری از گزینه ایمنی در کارت گفت‌وگوی جاری استفاده کن.'}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor={categoryId}>
          <span>دلیل گزارش</span>
          <select
            id={categoryId}
            value={category}
            required
            onChange={(event) => setCategory(event.target.value as ReportCategory | '')}
          >
            <option value="">انتخاب کن</option>
            {REPORT_REASONS.map((reason) => (
              <option key={reason.value} value={reason.value}>{reason.label}</option>
            ))}
          </select>
        </label>

        <label htmlFor={detailsId}>
          <span>توضیح بیشتر (اختیاری)</span>
          <textarea
            id={detailsId}
            value={details}
            maxLength={4000}
            rows={4}
            onChange={(event) => setDetails(event.target.value)}
          />
          <small>{details.length.toLocaleString('fa-IR')} از ۴٬۰۰۰ نویسه</small>
        </label>

        <label htmlFor={blockId} data-report-block>
          <input
            id={blockId}
            type="checkbox"
            checked={blockCounterparty}
            onChange={(event) => setBlockCounterparty(event.target.checked)}
          />
          <span>هم‌زمان این کاربر را مسدود کن</span>
        </label>

        <button type="submit" disabled={busy || !category}>
          {busy ? 'در حال ثبت…' : 'ثبت گزارش'}
        </button>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status" aria-live="polite">{notice}</p>}
      </form>
    </details>
  );
}
