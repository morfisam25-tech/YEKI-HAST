import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { isAdminBootstrapWindowOpen } from '../lib/admin-bootstrap.ts';
import { isCallerClosedBetaConfigured, isCallerClosedBetaEnabled, isCommercialHostingApproved } from '../lib/caller-beta.ts';
import { sendJson } from '../lib/http.ts';
import { getDefaultOperatingContextCodes } from '../lib/operating-context.ts';
import { getPublicReleaseConfig } from '../lib/public-release.ts';
import { validateEmailSecurityEnv, validateSecurityEnv } from '../lib/security.ts';
import { getSmsProvider } from '../providers/sms.ts';
import { validateEmailProviderEnv } from '../providers/email.ts';
import { validatePaymentProviderEnv } from '../providers/payment.ts';
import { validatePayoutProviderEnv } from '../providers/payout.ts';
import { validateTelephonyEnv } from '../providers/telephony.ts';
import { getCallTransportReadiness, validatePrimaryCallTransportEnv } from '../providers/call-transport.ts';
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

  const emailProvider = process.env.EMAIL_PROVIDER?.trim() || null;
  const smsProvider = process.env.SMS_PROVIDER?.trim() || null;
  const paymentProvider = process.env.PAYMENT_PROVIDER?.trim() || null;
  const payoutProvider = process.env.PAYOUT_PROVIDER?.trim() || null;
  const telephonyProvider = process.env.TELEPHONY_PROVIDER?.trim() || null;
  const kycInquiryProvider = process.env.KYC_INQUIRY_PROVIDER?.trim() || null;
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();

  const emailAuthReady = ready(() => {
    validateEmailSecurityEnv();
    validateEmailProviderEnv();
  });
  const smsReady = ready(() => getSmsProvider());
  const paymentReady = ready(() => validatePaymentProviderEnv());
  const payoutReady = ready(() => validatePayoutProviderEnv());
  const telephonyReady = ready(() => validateTelephonyEnv());
  const callTransportReady = ready(() => validatePrimaryCallTransportEnv());
  const kycInquiryReady = ready(() => validateKycInquiryProviderEnv());
  const sensitiveDataReady = ready(() => validateSecurityEnv());
  const manualPhoneVerificationEnabled = process.env.MANUAL_PHONE_VERIFICATION_BETA_ENABLED?.trim().toLowerCase() === 'true';
  const accountAuthReady = emailAuthReady || smsReady;
  const callPhoneVerificationReady = manualPhoneVerificationEnabled || smsReady;
  let callTransport: ReturnType<typeof getCallTransportReadiness> | null = null;
  try { callTransport = getCallTransportReadiness(); } catch {}
  const maskedPstnLaunchRequired = callTransport?.primary === 'masked_pstn';
  const maskedPstnFallbackSelected = callTransport?.fallback === 'masked_pstn';

  const publicRelease = getPublicReleaseConfig();

  const bootstrapAdminEnabled = process.env.BOOTSTRAP_ADMIN_ENABLED?.trim().toLowerCase() === 'true';
  const bootstrapAdminIdentityConfigured = configured(process.env.BOOTSTRAP_ADMIN_EMAIL)
    || configured(process.env.BOOTSTRAP_ADMIN_PHONE_E164);
  const bootstrapAdminExpiryConfigured = configured(process.env.BOOTSTRAP_ADMIN_EXPIRES_AT);
  const bootstrapAdminWindowOpen = isAdminBootstrapWindowOpen();
  // The bootstrap switch is a one-time recovery surface, not a steady-state launch dependency.
  // Public/caller launch stays closed until the switch, identity and expiry are all removed.
  const adminBootstrapLockedDown = !bootstrapAdminEnabled
    && !bootstrapAdminIdentityConfigured
    && !bootstrapAdminExpiryConfigured;

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
  const callerClosedBetaConfigured = isCallerClosedBetaConfigured();
  const callerClosedBetaEnabled = isCallerClosedBetaEnabled();
  const commercialHostingApproved = isCommercialHostingApproved();
  const callerLaunchReady = callerClosedBetaConfigured
    && commercialHostingApproved
    && callerAgePolicyReady
    && callerCatalogReady
    && accountAuthReady
    && callTransportReady
    && paymentReady
    && sensitiveDataReady
    && adminBootstrapLockedDown
    && publicRelease.ready;

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    integrations: {
      emailAuth: { provider: emailProvider, ready: emailAuthReady },
      sms: { provider: smsProvider, ready: smsReady, optionalWhenEmailAuthReady: true },
      accountAuth: { ready: accountAuthReady },
      callTransport: {
        ready: callTransportReady,
        primary: callTransport?.primary ?? null,
        fallback: callTransport?.fallback ?? null,
        internetVoiceReady: Boolean(callTransport?.internetVoice.configured && callTransport.internetVoice.relayConfigured),
        iranDomesticPathReady: Boolean(callTransport?.internetVoice.iranDomesticPathConfigured),
      },
      callPhoneVerification: {
        ready: callPhoneVerificationReady,
        manualBetaEnabled: manualPhoneVerificationEnabled,
        launchRequired: maskedPstnLaunchRequired,
        fallbackRequired: maskedPstnFallbackSelected,
      },
      payment: { provider: paymentProvider, ready: paymentReady },
      payout: { provider: payoutProvider, ready: payoutReady },
      telephony: {
        provider: telephonyProvider,
        ready: telephonyReady,
        launchRequired: maskedPstnLaunchRequired,
        fallbackRequired: maskedPstnFallbackSelected,
      },
      kycInquiry: { provider: kycInquiryProvider, ready: kycInquiryReady },
      sensitiveData: { ready: sensitiveDataReady },
      commercialHosting: { ready: commercialHostingApproved },
      publicReleasePolicy: {
        ready: publicRelease.ready,
        privacyPolicyReady: Boolean(publicRelease.privacyPolicyUrl),
        termsOfServiceReady: Boolean(publicRelease.termsOfServiceUrl),
        accountDeletionReady: Boolean(publicRelease.accountDeletionUrl),
        supportReady: Boolean(publicRelease.supportEmail),
      },
      adminBootstrap: {
        lockedDown: adminBootstrapLockedDown,
        enabled: bootstrapAdminEnabled,
        identityConfigured: bootstrapAdminIdentityConfigured,
        expiryConfigured: bootstrapAdminExpiryConfigured,
        windowOpen: bootstrapAdminWindowOpen,
      },
      callerCatalog: { ready: callerCatalogReady },
      callerAgePolicy: { ready: callerAgePolicyReady },
      callerClosedBeta: { configured: callerClosedBetaConfigured, enabled: callerClosedBetaEnabled },
      callerLaunch: { ready: callerLaunchReady },
    },
    secretsIncluded: false,
  });
}
