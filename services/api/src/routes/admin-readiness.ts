import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireAdmin } from '../lib/admin.ts';
import { sendJson } from '../lib/http.ts';
import { getSmsProvider } from '../providers/sms.ts';
import { validatePaymentProviderEnv } from '../providers/payment.ts';
import { validatePayoutProviderEnv } from '../providers/payout.ts';
import { validateTelephonyEnv } from '../providers/telephony.ts';
import { validateKycInquiryProviderEnv } from '../providers/kyc-inquiry.ts';

function ready(check: () => unknown): boolean {
  try { check(); return true; }
  catch { return false; }
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export async function getAdminIntegrationReadiness(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);

  const smsProvider = process.env.SMS_PROVIDER?.trim() || null;
  const paymentProvider = process.env.PAYMENT_PROVIDER?.trim() || null;
  const payoutProvider = process.env.PAYOUT_PROVIDER?.trim() || null;
  const telephonyProvider = process.env.TELEPHONY_PROVIDER?.trim() || null;
  const kycInquiryProvider = process.env.KYC_INQUIRY_PROVIDER?.trim() || null;

  const smsReady = ready(() => getSmsProvider());
  const paymentReady = ready(() => validatePaymentProviderEnv());
  const payoutReady = ready(() => validatePayoutProviderEnv());
  const telephonyReady = ready(() => validateTelephonyEnv());
  const kycInquiryReady = ready(() => validateKycInquiryProviderEnv());
  const callerAgePolicyReady = configured(process.env.CALLER_AGE_POLICY_VERSION)
    && Number.isInteger(Number(process.env.CALLER_MINIMUM_AGE))
    && Number(process.env.CALLER_MINIMUM_AGE) >= 13
    && Number(process.env.CALLER_MINIMUM_AGE) <= 99;

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    integrations: {
      sms: { provider: smsProvider, ready: smsReady },
      payment: { provider: paymentProvider, ready: paymentReady },
      payout: { provider: payoutProvider, ready: payoutReady },
      telephony: { provider: telephonyProvider, ready: telephonyReady },
      kycInquiry: { provider: kycInquiryProvider, ready: kycInquiryReady },
      callerAgePolicy: { ready: callerAgePolicyReady },
    },
    secretsIncluded: false,
  });
}
