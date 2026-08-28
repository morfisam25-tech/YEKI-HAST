import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { sendJson } from '../lib/http.ts';
import { getDefaultOperatingContextCodes } from '../lib/operating-context.ts';
import { validateSecurityEnv } from '../lib/security.ts';
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
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();

  const smsReady = ready(() => getSmsProvider());
  const paymentReady = ready(() => validatePaymentProviderEnv());
  const payoutReady = ready(() => validatePayoutProviderEnv());
  const telephonyReady = ready(() => validateTelephonyEnv());
  const kycInquiryReady = ready(() => validateKycInquiryProviderEnv());
  const sensitiveDataReady = ready(() => validateSecurityEnv());
  const catalog = await query<{ pricing_ready: boolean; language_ready: boolean }>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM app.pricing_plans pp
        JOIN app.products p ON p.id=pp.product_id
        JOIN app.service_catalog s ON s.id=pp.service_id
        JOIN app.markets m ON m.id=pp.market_id
        WHERE p.code=$1
          AND s.code=$2 AND s.status='active'
          AND m.code=$3 AND m.is_active=true
          AND pp.is_active=true
      ) AS pricing_ready,
      EXISTS (SELECT 1 FROM app.languages WHERE is_active=true) AS language_ready
  `, [productCode, serviceCode, marketCode]);
  const callerCatalogReady = Boolean(catalog.rows[0]?.pricing_ready && catalog.rows[0]?.language_ready);
  const callerAgePolicyReady = configured(process.env.CALLER_AGE_POLICY_VERSION)
    && Number.isInteger(Number(process.env.CALLER_MINIMUM_AGE))
    && Number(process.env.CALLER_MINIMUM_AGE) >= 13
    && Number(process.env.CALLER_MINIMUM_AGE) <= 99;
  const callerClosedBetaEnabled = process.env.CALLER_CLOSED_BETA_ENABLED?.trim().toLowerCase() === 'true';
  const callerLaunchReady = callerClosedBetaEnabled
    && callerAgePolicyReady
    && callerCatalogReady
    && smsReady
    && paymentReady
    && telephonyReady
    && sensitiveDataReady;

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    integrations: {
      sms: { provider: smsProvider, ready: smsReady },
      payment: { provider: paymentProvider, ready: paymentReady },
      payout: { provider: payoutProvider, ready: payoutReady },
      telephony: { provider: telephonyProvider, ready: telephonyReady },
      kycInquiry: { provider: kycInquiryProvider, ready: kycInquiryReady },
      sensitiveData: { ready: sensitiveDataReady },
      callerCatalog: { ready: callerCatalogReady },
      callerAgePolicy: { ready: callerAgePolicyReady },
      callerClosedBeta: { enabled: callerClosedBetaEnabled },
      callerLaunch: { ready: callerLaunchReady },
    },
    secretsIncluded: false,
  });
}
