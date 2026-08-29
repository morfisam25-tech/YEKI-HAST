'use client';

import { useEffect, useState } from 'react';

type Integration = { provider?: string | null; ready: boolean };
type Readiness = {
  generatedAt: string;
  integrations: {
    emailAuth: Integration;
    sms: Integration & { optionalWhenEmailAndManualPhoneVerificationReady?: boolean };
    accountAuth: Integration;
    callPhoneVerification: Integration & { manualBetaEnabled?: boolean };
    payment: Integration;
    payout: Integration;
    telephony: Integration;
    kycInquiry: Integration;
    sensitiveData: Integration;
    publicReleasePolicy: {
      ready: boolean;
      privacyPolicyReady: boolean;
      termsOfServiceReady: boolean;
      accountDeletionReady: boolean;
      supportReady: boolean;
    };
    adminBootstrap: {
      lockedDown: boolean;
      enabled: boolean;
      identityConfigured: boolean;
      expiryConfigured: boolean;
      windowOpen: boolean;
    };
    callerCatalog: Integration;
    callerAgePolicy: Integration;
    callerClosedBeta: { enabled: boolean };
    callerLaunch: { ready: boolean };
  };
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body as T;
}

const labels: Array<[keyof Pick<Readiness['integrations'], 'emailAuth' | 'sms' | 'accountAuth' | 'callPhoneVerification' | 'payment' | 'payout' | 'telephony' | 'kycInquiry' | 'sensitiveData' | 'callerCatalog' | 'callerAgePolicy'>, string]> = [
  ['emailAuth', 'ورود با ایمیل'],
  ['accountAuth', 'ورود حساب'],
  ['callPhoneVerification', 'تأیید شماره تماس'],
  ['sms', 'OTP / SMS (مسیر جایگزین)'],
  ['payment', 'شارژ کیف پول'],
  ['payout', 'تسویه شنونده'],
  ['telephony', 'اتصال تماس'],
  ['kycInquiry', 'استعلام KYC'],
  ['sensitiveData', 'امنیت داده حساس'],
  ['callerCatalog', 'کاتالوگ و قیمت‌گذاری Caller'],
  ['callerAgePolicy', 'سیاست سن Caller'],
];

export default function ReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setData(await api<Readiness>('/api/ops/integration-readiness'));
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'request_failed')); }, []);

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="kicker">YEKI HAST · READINESS</p>
          <h1>آمادگی اتصال‌های عملیاتی</h1>
          <p className="muted">این صفحه فقط آماده‌بودن تنظیمات را نشان می‌دهد و هیچ secret، credential، URL خصوصی یا مقدار هویتی را نمایش نمی‌دهد.</p>
        </div>
        <div className="actions"><button className="ghost" onClick={() => load()}>به‌روزرسانی</button></div>
      </header>

      <section className="panel">
        {error && <p className="error">{error}</p>}
        {!data ? <p className="muted">در حال خواندن وضعیت…</p> : (
          <>
            <div className="sectionHeader">
              <div>
                <p className="kicker">CALLER CLOSED BETA</p>
                <h2>{data.integrations.callerLaunch.ready ? 'READY TO OPEN' : 'BLOCKED'}</h2>
              </div>
              <span className="statusPill">{data.integrations.callerClosedBeta.enabled ? 'BETA ENABLED' : 'BETA DISABLED'}</span>
            </div>
            <p className="muted">
              Caller فقط وقتی READY می‌شود که Beta، سیاست سن، کاتالوگ و قیمت‌گذاری، ورود حساب، تأیید شماره تماس، پرداخت، Telephony، امنیت داده حساس، صفحات و پشتیبانی عمومی و قفل‌بودن کامل bootstrap ادمین آماده باشند. SMS به‌تنهایی الزام مستقل لانچ نیست؛ در بتای دستی می‌تواند با ورود ایمیلی و تأیید دستی شماره جایگزین شود.
            </p>

            <div className="grid">
              {labels.map(([key, label]) => {
                const item = data.integrations[key];
                return (
                  <article key={key}>
                    <small>{label}</small>
                    <strong>{item.ready ? 'READY' : 'BLOCKED'}</strong>
                    <p className="muted">{item.provider ?? (key === 'callPhoneVerification' && data.integrations.callPhoneVerification.manualBetaEnabled ? 'manual beta' : 'بدون provider')}</p>
                  </article>
                );
              })}
            </div>

            <div className="sectionHeader">
              <div>
                <p className="kicker">PUBLIC RELEASE</p>
                <h2>{data.integrations.publicReleasePolicy.ready ? 'READY' : 'BLOCKED'}</h2>
              </div>
              <span className="statusPill">PUBLIC SURFACE</span>
            </div>
            <div className="grid">
              <article>
                <small>Privacy Policy</small>
                <strong>{data.integrations.publicReleasePolicy.privacyPolicyReady ? 'READY' : 'BLOCKED'}</strong>
                <p className="muted">فقط وضعیت اعتبار URL عمومی نمایش داده می‌شود.</p>
              </article>
              <article>
                <small>Terms of Service</small>
                <strong>{data.integrations.publicReleasePolicy.termsOfServiceReady ? 'READY' : 'BLOCKED'}</strong>
                <p className="muted">متن یا URL در Admin افشا نمی‌شود.</p>
              </article>
              <article>
                <small>Account Deletion</small>
                <strong>{data.integrations.publicReleasePolicy.accountDeletionReady ? 'READY' : 'BLOCKED'}</strong>
                <p className="muted">مسیر عمومی حذف حساب باید قابل دسترس باشد.</p>
              </article>
              <article>
                <small>Support</small>
                <strong>{data.integrations.publicReleasePolicy.supportReady ? 'READY' : 'BLOCKED'}</strong>
                <p className="muted">فقط configured بودن ایمیل پشتیبانی بررسی می‌شود.</p>
              </article>
            </div>

            <div className="sectionHeader">
              <div>
                <p className="kicker">ADMIN BOOTSTRAP</p>
                <h2>{data.integrations.adminBootstrap.lockedDown ? 'LOCKED DOWN' : 'BLOCKED'}</h2>
              </div>
              <span className="statusPill">ONE-TIME SURFACE</span>
            </div>
            <div className="grid">
              <article>
                <small>Bootstrap switch</small>
                <strong>{data.integrations.adminBootstrap.enabled ? 'ENABLED' : 'OFF'}</strong>
                <p className="muted">برای لانچ عمومی باید OFF باشد.</p>
              </article>
              <article>
                <small>Bootstrap identity</small>
                <strong>{data.integrations.adminBootstrap.identityConfigured ? 'CONFIGURED' : 'CLEARED'}</strong>
                <p className="muted">برای steady state باید پاک شده باشد.</p>
              </article>
              <article>
                <small>Bootstrap expiry</small>
                <strong>{data.integrations.adminBootstrap.expiryConfigured ? 'CONFIGURED' : 'CLEARED'}</strong>
                <p className="muted">برای steady state باید پاک شده باشد.</p>
              </article>
              <article>
                <small>Bootstrap window</small>
                <strong>{data.integrations.adminBootstrap.windowOpen ? 'OPEN' : 'CLOSED'}</strong>
                <p className="muted">لانچ با window باز مجاز نیست.</p>
              </article>
            </div>

            <p className="muted">آخرین بررسی: {new Date(data.generatedAt).toLocaleString('fa-IR')}</p>
          </>
        )}
      </section>
    </main>
  );
}
