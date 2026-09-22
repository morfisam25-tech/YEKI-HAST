import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { WEB_SESSION_COOKIE, backendRequest, jsonOrNull } from '../api/_backend';

type ApplicationStatus = { status?: unknown };
type KycStatus = { status?: unknown };

async function agreementReady(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(WEB_SESSION_COOKIE)?.value;
  if (!token) return false;

  try {
    const applicationResponse = await backendRequest('/v1/listener/application', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!applicationResponse.ok) return false;
    const application = await jsonOrNull(applicationResponse) as ApplicationStatus | null;
    if (application?.status === 'agreement_pending') return true;
    if (application?.status !== 'kyc_pending') return false;

    // Compatibility handoff for an applicant whose field checks reached the
    // verified aggregate before W87 introduced agreement_pending. The actual
    // agreement endpoint re-checks the field-level evidence transactionally.
    const kycResponse = await backendRequest('/v1/listener/kyc', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!kycResponse.ok) return false;
    const kyc = await jsonOrNull(kycResponse) as KycStatus | null;
    return kyc?.status === 'verified';
  } catch {
    return false;
  }
}

export default async function ListenerLayout({ children }: { children: ReactNode }) {
  const showAgreement = await agreementReady();
  return (
    <>
      {showAgreement && (
        <aside
          role="status"
          style={{
            margin: '18px auto 0',
            maxWidth: '920px',
            padding: '14px 16px',
            border: '1px solid #d8d5cd',
            borderRadius: '14px',
            background: '#fffefa',
            direction: 'rtl',
          }}
        >
          <strong>مرحله بعد: پذیرش قوانین شنونده</strong>{' '}
          <span>بررسی‌های لازم KYC تکمیل شده‌اند. برای ورود درخواست به بررسی نهایی ادمین، قوانین فعلی شنونده را بخوان و صریحاً بپذیر.</span>{' '}
          <a href="/listener/agreement" style={{ fontWeight: 700 }}>بازکردن مرحله پذیرش</a>
        </aside>
      )}
      {children}
    </>
  );
}
