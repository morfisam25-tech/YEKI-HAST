import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../packages/db/src/client.ts';
import { validateDatabaseEnv, validateOtpEnv } from './lib/env.ts';
import { HttpError, sendJson } from './lib/http.ts';

function ensureDatabaseReady(): void {
  try { validateDatabaseEnv(); }
  catch { throw new HttpError(503, 'service_not_ready'); }
}

function ensureOtpReady(): void {
  try { validateOtpEnv(); }
  catch { throw new HttpError(503, 'auth_not_configured'); }
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/') {
      sendJson(res, 200, {
        ok: true,
        service: 'yeki-hast-api',
        version: '0.0.8',
        endpoints: ['/health', '/ready', '/v1/bootstrap'],
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'yeki-hast-api', version: '0.0.8' });
      return;
    }

    if (method === 'GET' && url.pathname === '/ready') {
      ensureDatabaseReady();
      await query('SELECT 1');
      sendJson(res, 200, { ok: true, database: 'ready' });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/bootstrap') {
      ensureDatabaseReady();
      const { bootstrap } = await import('./routes/bootstrap.ts');
      return await bootstrap(res);
    }

    if (method === 'POST' && url.pathname === '/v1/auth/otp/request') {
      ensureOtpReady();
      const { requestOtp } = await import('./routes/auth.ts');
      return await requestOtp(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/auth/otp/verify') {
      ensureOtpReady();
      const { verifyOtp } = await import('./routes/auth.ts');
      return await verifyOtp(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/caller/age-gate') {
      ensureDatabaseReady();
      const { setAgeGate } = await import('./routes/caller.ts');
      return await setAgeGate(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/caller/waitlist') {
      ensureDatabaseReady();
      const { joinWaitlist } = await import('./routes/caller.ts');
      return await joinWaitlist(req, res);
    }

    if (method === 'GET' && url.pathname === '/v1/listeners') {
      ensureDatabaseReady();
      const { browseListeners } = await import('./routes/marketplace.ts');
      return await browseListeners(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/listener/application') {
      ensureDatabaseReady();
      const { createListenerApplication } = await import('./routes/listener.ts');
      return await createListenerApplication(req, res);
    }

    if (method === 'GET' && url.pathname === '/v1/listener/application') {
      ensureDatabaseReady();
      const { getListenerApplication } = await import('./routes/listener.ts');
      return await getListenerApplication(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/listener/training/complete') {
      ensureDatabaseReady();
      const { completeListenerTraining } = await import('./routes/listener.ts');
      return await completeListenerTraining(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/listener/assessment') {
      ensureDatabaseReady();
      const { submitListenerAssessment } = await import('./routes/listener.ts');
      return await submitListenerAssessment(req, res);
    }

    if (method === 'GET' && url.pathname === '/v1/listener/presence') {
      ensureDatabaseReady();
      const { getListenerPresence } = await import('./routes/marketplace.ts');
      return await getListenerPresence(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/listener/presence') {
      ensureDatabaseReady();
      const { setListenerPresence } = await import('./routes/marketplace.ts');
      return await setListenerPresence(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/listener/presence/heartbeat') {
      ensureDatabaseReady();
      const { heartbeatListenerPresence } = await import('./routes/marketplace.ts');
      return await heartbeatListenerPresence(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/calls/request') {
      ensureDatabaseReady();
      const { requestCall } = await import('./routes/calls.ts');
      return await requestCall(req, res);
    }

    const cancelMatch = url.pathname.match(/^\/v1\/calls\/([^/]+)\/cancel$/);
    if (method === 'POST' && cancelMatch) {
      ensureDatabaseReady();
      const { cancelCall } = await import('./routes/calls.ts');
      return await cancelCall(req, res, cancelMatch[1]);
    }

    const callMatch = url.pathname.match(/^\/v1\/calls\/([^/]+)$/);
    if (method === 'GET' && callMatch) {
      ensureDatabaseReady();
      const { getCall } = await import('./routes/calls.ts');
      return await getCall(req, res, callMatch[1]);
    }

    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.code });
      return;
    }
    console.error(error);
    sendJson(res, 500, { error: 'internal_error' });
  }
}
