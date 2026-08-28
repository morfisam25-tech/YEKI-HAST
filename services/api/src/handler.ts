import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../packages/db/src/client.ts';
import { validateDatabaseEnv, validateOtpEnv } from './lib/env.ts';
import { validateEmailSecurityEnv, validateKycSecurityEnv, validateSecurityEnv } from './lib/security.ts';
import { requireCallerClosedBetaEnabled } from './lib/caller-beta.ts';
import { validateTelephonyEnv } from './providers/telephony.ts';
import { validateEmailProviderEnv } from './providers/email.ts';
import { HttpError, sendJson } from './lib/http.ts';

function ensureDatabaseReady(): void {
  try { validateDatabaseEnv(); }
  catch { throw new HttpError(503, 'service_not_ready'); }
}
function ensureOtpReady(): void {
  try { validateOtpEnv(); }
  catch { throw new HttpError(503, 'auth_not_configured'); }
}
function ensureEmailAuthReady(): void {
  ensureDatabaseReady();
  try {
    validateEmailSecurityEnv();
    validateEmailProviderEnv();
  } catch {
    throw new HttpError(503, 'email_auth_not_configured');
  }
}
function ensureSensitiveDataReady(): void {
  ensureDatabaseReady();
  try { validateSecurityEnv(); }
  catch { throw new HttpError(503, 'sensitive_data_not_configured'); }
}
function ensureKycReady(): void {
  ensureDatabaseReady();
  try { validateKycSecurityEnv(); }
  catch { throw new HttpError(503, 'kyc_not_configured'); }
}
function ensureCallReady(): void {
  ensureDatabaseReady();
  try { validateTelephonyEnv(); }
  catch { throw new HttpError(503, 'telephony_not_configured'); }
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/') { sendJson(res, 200, { ok: true, service: 'yeki-hast-api', version: '0.0.8', endpoints: ['/health', '/ready', '/v1/bootstrap'] }); return; }
    if (method === 'GET' && url.pathname === '/health') { sendJson(res, 200, { ok: true, service: 'yeki-hast-api', version: '0.0.8' }); return; }
    if (method === 'GET' && url.pathname === '/ready') { ensureDatabaseReady(); await query('SELECT 1'); sendJson(res, 200, { ok: true, database: 'ready' }); return; }
    if (method === 'GET' && url.pathname === '/v1/bootstrap') { ensureDatabaseReady(); const { bootstrap } = await import('./routes/bootstrap.ts'); return await bootstrap(res); }
    if (method === 'GET' && url.pathname === '/v1/payments/nextpay/callback') { ensureDatabaseReady(); const { nextPayCallback } = await import('./routes/payments.ts'); return await nextPayCallback(req, res); }
    if (method === 'POST' && url.pathname === '/v1/auth/email/request') { ensureEmailAuthReady(); const { requestEmailOtp } = await import('./routes/auth-email.ts'); return await requestEmailOtp(req, res); }
    if (method === 'POST' && url.pathname === '/v1/auth/email/verify') { ensureEmailAuthReady(); const { verifyEmailOtp } = await import('./routes/auth-email.ts'); return await verifyEmailOtp(req, res); }
    if (method === 'POST' && url.pathname === '/v1/auth/otp/request') { ensureOtpReady(); const { requestOtp } = await import('./routes/auth.ts'); return await requestOtp(req, res); }
    if (method === 'POST' && url.pathname === '/v1/auth/otp/verify') { ensureOtpReady(); const { verifyOtp } = await import('./routes/auth.ts'); return await verifyOtp(req, res); }
    if (method === 'GET' && url.pathname === '/v1/auth/session') { ensureDatabaseReady(); const { getCurrentSession } = await import('./routes/auth.ts'); return await getCurrentSession(req, res); }
    if (method === 'POST' && url.pathname === '/v1/auth/logout') { ensureDatabaseReady(); const { logoutCurrentSession } = await import('./routes/auth.ts'); return await logoutCurrentSession(req, res); }
    if (method === 'GET' && url.pathname === '/v1/wallet') { ensureDatabaseReady(); const { getWallet } = await import('./routes/payments.ts'); return await getWallet(req, res); }
    if (method === 'GET' && url.pathname === '/v1/wallet/transactions') { ensureDatabaseReady(); const { getWalletTransactions } = await import('./routes/payments.ts'); return await getWalletTransactions(req, res); }
    if (method === 'POST' && url.pathname === '/v1/wallet/topups') { ensureDatabaseReady(); const { createWalletTopup } = await import('./routes/payments.ts'); return await createWalletTopup(req, res); }

    const topupVerifyMatch = url.pathname.match(/^\/v1\/wallet\/topups\/([^/]+)\/verify$/);
    if (method === 'POST' && topupVerifyMatch) { ensureDatabaseReady(); const { verifyWalletTopup } = await import('./routes/payments.ts'); return await verifyWalletTopup(req, res, topupVerifyMatch[1]); }
    const topupMatch = url.pathname.match(/^\/v1\/wallet\/topups\/([^/]+)$/);
    if (method === 'GET' && topupMatch) { ensureDatabaseReady(); const { getWalletTopup } = await import('./routes/payments.ts'); return await getWalletTopup(req, res, topupMatch[1]); }
    if (method === 'POST' && url.pathname === '/v1/caller/age-gate') { requireCallerClosedBetaEnabled(); ensureDatabaseReady(); const { setAgeGate } = await import('./routes/caller.ts'); return await setAgeGate(req, res); }
    if (method === 'POST' && url.pathname === '/v1/caller/waitlist') { ensureDatabaseReady(); const { joinWaitlist } = await import('./routes/caller.ts'); return await joinWaitlist(req, res); }
    if (method === 'GET' && url.pathname === '/v1/caller/calls/recent') { ensureDatabaseReady(); const { getCallerRecentCalls } = await import('./routes/caller-calls.ts'); return await getCallerRecentCalls(req, res); }
    if (method === 'GET' && url.pathname === '/v1/listeners') { requireCallerClosedBetaEnabled(); ensureDatabaseReady(); const { browseListeners } = await import('./routes/marketplace.ts'); return await browseListeners(req, res); }
    if (method === 'POST' && url.pathname === '/v1/listener/application') { ensureDatabaseReady(); const { createListenerApplication } = await import('./routes/listener.ts'); return await createListenerApplication(req, res); }
    if (method === 'GET' && url.pathname === '/v1/listener/application') { ensureDatabaseReady(); const { getListenerApplication } = await import('./routes/listener.ts'); return await getListenerApplication(req, res); }
    if (method === 'GET' && url.pathname === '/v1/listener/earnings') { ensureDatabaseReady(); const { getListenerEarnings } = await import('./routes/listener-earnings.ts'); return await getListenerEarnings(req, res); }
    if (method === 'POST' && url.pathname === '/v1/listener/training/complete') { ensureDatabaseReady(); const { completeListenerTraining } = await import('./routes/listener.ts'); return await completeListenerTraining(req, res); }
    if (method === 'POST' && url.pathname === '/v1/listener/assessment') { ensureDatabaseReady(); const { submitListenerAssessment } = await import('./routes/listener.ts'); return await submitListenerAssessment(req, res); }
    if (method === 'GET' && url.pathname === '/v1/listener/kyc') { ensureDatabaseReady(); const { getListenerKycStatus } = await import('./routes/kyc.ts'); return await getListenerKycStatus(req, res); }
    if (method === 'POST' && url.pathname === '/v1/listener/kyc') { ensureKycReady(); const { submitListenerKyc } = await import('./routes/kyc.ts'); return await submitListenerKyc(req, res); }
    if (method === 'GET' && url.pathname === '/v1/listener/presence') { ensureDatabaseReady(); const { getListenerPresence } = await import('./routes/marketplace.ts'); return await getListenerPresence(req, res); }
    if (method === 'POST' && url.pathname === '/v1/listener/presence') { ensureDatabaseReady(); const { setListenerPresence } = await import('./routes/marketplace.ts'); return await setListenerPresence(req, res); }
    if (method === 'POST' && url.pathname === '/v1/listener/presence/heartbeat') { ensureDatabaseReady(); const { heartbeatListenerPresence } = await import('./routes/marketplace.ts'); return await heartbeatListenerPresence(req, res); }
    if (method === 'GET' && url.pathname === '/v1/listener/calls/active') { ensureDatabaseReady(); const { getListenerActiveCall } = await import('./routes/listener-calls.ts'); return await getListenerActiveCall(req, res); }
    if (method === 'GET' && url.pathname === '/v1/listener/calls/recent') { ensureDatabaseReady(); const { getListenerRecentCalls } = await import('./routes/listener-calls.ts'); return await getListenerRecentCalls(req, res); }
    if (method === 'GET' && url.pathname === '/v1/calls/active') { requireCallerClosedBetaEnabled(); ensureDatabaseReady(); const { getActiveCall } = await import('./routes/calls.ts'); return await getActiveCall(req, res); }
    if (method === 'POST' && url.pathname === '/v1/calls/request') { requireCallerClosedBetaEnabled(); ensureCallReady(); const { requestCall } = await import('./routes/calls.ts'); return await requestCall(req, res); }
    if (method === 'POST' && url.pathname === '/v1/safety/report') { ensureSensitiveDataReady(); const { reportCall } = await import('./routes/safety.ts'); return await reportCall(req, res); }
    if (method === 'POST' && url.pathname === '/v1/safety/block') { ensureDatabaseReady(); const { blockCallCounterparty } = await import('./routes/safety.ts'); return await blockCallCounterparty(req, res); }

    if (method === 'GET' && url.pathname === '/v1/admin/operations/summary') { ensureDatabaseReady(); const { getAdminOperationsSummary } = await import('./routes/admin.ts'); return await getAdminOperationsSummary(req, res); }
    if (method === 'GET' && url.pathname === '/v1/admin/integration-readiness') { ensureDatabaseReady(); const { getAdminIntegrationReadiness } = await import('./routes/admin-readiness.ts'); return await getAdminIntegrationReadiness(req, res); }
    if (method === 'GET' && url.pathname === '/v1/admin/listener-applications') { ensureDatabaseReady(); const { listListenerApplications } = await import('./routes/admin.ts'); return await listListenerApplications(req, res); }
    if (method === 'GET' && url.pathname === '/v1/admin/payouts') { ensureDatabaseReady(); const { listAdminPayouts } = await import('./routes/admin-payouts.ts'); return await listAdminPayouts(req, res); }
    if (method === 'POST' && url.pathname === '/v1/admin/payouts/prepare') { ensureDatabaseReady(); const { prepareAdminPayout } = await import('./routes/admin-payouts.ts'); return await prepareAdminPayout(req, res); }
    if (method === 'GET' && url.pathname === '/v1/admin/payment-attempts') { ensureDatabaseReady(); const { listAdminPaymentAttempts } = await import('./routes/admin-payments.ts'); return await listAdminPaymentAttempts(req, res); }
    if (method === 'GET' && url.pathname === '/v1/admin/caller-waitlist') { ensureDatabaseReady(); const { listAdminCallerWaitlist } = await import('./routes/admin-waitlist.ts'); return await listAdminCallerWaitlist(req, res); }
    if (method === 'GET' && url.pathname === '/v1/admin/safety-cases') { ensureDatabaseReady(); const { listAdminSafetyCases } = await import('./routes/admin-safety.ts'); return await listAdminSafetyCases(req, res); }
    if (method === 'GET' && url.pathname === '/v1/admin/calls') { ensureDatabaseReady(); const { listAdminCalls } = await import('./routes/admin-calls.ts'); return await listAdminCalls(req, res); }

    const adminCallRecoveryMatch = url.pathname.match(/^\/v1\/admin\/calls\/([^/]+)\/recover-stale-routing$/);
    if (method === 'POST' && adminCallRecoveryMatch) { ensureDatabaseReady(); const { recoverStaleRoutingCall } = await import('./routes/admin-call-recovery.ts'); return await recoverStaleRoutingCall(req, res, adminCallRecoveryMatch[1]); }
    const adminSafetyActionMatch = url.pathname.match(/^\/v1\/admin\/safety-cases\/(reports|events)\/([^/]+)$/);
    if (method === 'POST' && adminSafetyActionMatch) { ensureDatabaseReady(); const { actOnAdminSafetyCase } = await import('./routes/admin-safety.ts'); return await actOnAdminSafetyCase(req, res, adminSafetyActionMatch[1] === 'reports' ? 'report' : 'event', adminSafetyActionMatch[2]); }
    const adminKycMatch = url.pathname.match(/^\/v1\/admin\/listener-applications\/([^/]+)\/kyc$/);
    if (method === 'GET' && adminKycMatch) { ensureDatabaseReady(); const { getListenerKycForAdmin } = await import('./routes/admin-kyc.ts'); return await getListenerKycForAdmin(req, res, adminKycMatch[1]); }
    if (method === 'POST' && adminKycMatch) { ensureDatabaseReady(); const { reviewListenerKyc } = await import('./routes/admin-kyc.ts'); return await reviewListenerKyc(req, res, adminKycMatch[1]); }
    const adminApplicationMatch = url.pathname.match(/^\/v1\/admin\/listener-applications\/([^/]+)$/);
    if (method === 'GET' && adminApplicationMatch) { ensureDatabaseReady(); const { getListenerApplicationForAdmin } = await import('./routes/admin.ts'); return await getListenerApplicationForAdmin(req, res, adminApplicationMatch[1]); }
    const adminAssessmentMatch = url.pathname.match(/^\/v1\/admin\/listener-assessments\/([^/]+)\/review$/);
    if (method === 'POST' && adminAssessmentMatch) { ensureDatabaseReady(); const { reviewListenerAssessment } = await import('./routes/admin.ts'); return await reviewListenerAssessment(req, res, adminAssessmentMatch[1]); }
    const payoutDispatchMatch = url.pathname.match(/^\/v1\/admin\/payouts\/([^/]+)\/dispatch$/);
    if (method === 'POST' && payoutDispatchMatch) { ensureKycReady(); const { dispatchPayout } = await import('./routes/payouts.ts'); return await dispatchPayout(req, res, payoutDispatchMatch[1]); }
    const payoutReconcileMatch = url.pathname.match(/^\/v1\/admin\/payouts\/([^/]+)\/reconcile$/);
    if (method === 'POST' && payoutReconcileMatch) { ensureDatabaseReady(); const { reconcilePayout } = await import('./routes/payouts.ts'); return await reconcilePayout(req, res, payoutReconcileMatch[1]); }
    const dispatchMatch = url.pathname.match(/^\/v1\/calls\/([^/]+)\/dispatch$/);
    if (method === 'POST' && dispatchMatch) { requireCallerClosedBetaEnabled(); ensureCallReady(); ensureSensitiveDataReady(); const { dispatchCall } = await import('./routes/call-dispatch.ts'); return await dispatchCall(req, res, dispatchMatch[1]); }
    const safetyExitMatch = url.pathname.match(/^\/v1\/calls\/([^/]+)\/safety-exit$/);
    if (method === 'POST' && safetyExitMatch) { ensureSensitiveDataReady(); const { safetyExitCall } = await import('./routes/safety.ts'); return await safetyExitCall(req, res, safetyExitMatch[1]); }
    const cancelMatch = url.pathname.match(/^\/v1\/calls\/([^/]+)\/cancel$/);
    if (method === 'POST' && cancelMatch) { ensureDatabaseReady(); const { cancelCall } = await import('./routes/calls.ts'); return await cancelCall(req, res, cancelMatch[1]); }
    const callMatch = url.pathname.match(/^\/v1\/calls\/([^/]+)$/);
    if (method === 'GET' && callMatch) { ensureDatabaseReady(); const { getCall } = await import('./routes/calls.ts'); return await getCall(req, res, callMatch[1]); }

    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    if (error instanceof HttpError) { sendJson(res, error.status, { error: error.code }); return; }
    console.error(error);
    sendJson(res, 500, { error: 'internal_error' });
  }
}
