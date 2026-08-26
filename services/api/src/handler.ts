import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../packages/db/src/client.ts';
import { validateDatabaseEnv, validateOtpEnv } from './lib/env.ts';
import { HttpError, sendJson } from './lib/http.ts';

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
      validateDatabaseEnv();
      await query('SELECT 1');
      sendJson(res, 200, { ok: true, database: 'ready' });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/bootstrap') {
      validateDatabaseEnv();
      const { bootstrap } = await import('./routes/bootstrap.ts');
      return await bootstrap(res);
    }

    if (method === 'POST' && url.pathname === '/v1/auth/otp/request') {
      validateOtpEnv();
      const { requestOtp } = await import('./routes/auth.ts');
      return await requestOtp(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/auth/otp/verify') {
      validateOtpEnv();
      const { verifyOtp } = await import('./routes/auth.ts');
      return await verifyOtp(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/caller/age-gate') {
      validateDatabaseEnv();
      const { setAgeGate } = await import('./routes/caller.ts');
      return await setAgeGate(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/caller/waitlist') {
      validateDatabaseEnv();
      const { joinWaitlist } = await import('./routes/caller.ts');
      return await joinWaitlist(req, res);
    }

    if (method === 'POST' && url.pathname === '/v1/listener/application') {
      validateDatabaseEnv();
      const { createListenerApplication } = await import('./routes/listener.ts');
      return await createListenerApplication(req, res);
    }

    if (method === 'GET' && url.pathname === '/v1/listener/application') {
      validateDatabaseEnv();
      const { getListenerApplication } = await import('./routes/listener.ts');
      return await getListenerApplication(req, res);
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
