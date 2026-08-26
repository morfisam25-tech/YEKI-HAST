import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '@yeki-hast/db';
import { HttpError, sendJson } from './lib/http.ts';
import { requestOtp, verifyOtp } from './routes/auth.ts';
import { bootstrap } from './routes/bootstrap.ts';
import { joinWaitlist, setAgeGate } from './routes/caller.ts';
import { createListenerApplication, getListenerApplication } from './routes/listener.ts';

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
    if (method === 'GET' && url.pathname === '/health') { sendJson(res, 200, { ok: true, service: 'yeki-hast-api', version: '0.0.8' }); return; }
    if (method === 'GET' && url.pathname === '/ready') { await query('SELECT 1'); sendJson(res, 200, { ok: true, database: 'ready' }); return; }
    if (method === 'GET' && url.pathname === '/v1/bootstrap') return await bootstrap(res);
    if (method === 'POST' && url.pathname === '/v1/auth/otp/request') return await requestOtp(req, res);
    if (method === 'POST' && url.pathname === '/v1/auth/otp/verify') return await verifyOtp(req, res);
    if (method === 'POST' && url.pathname === '/v1/caller/age-gate') return await setAgeGate(req, res);
    if (method === 'POST' && url.pathname === '/v1/caller/waitlist') return await joinWaitlist(req, res);
    if (method === 'POST' && url.pathname === '/v1/listener/application') return await createListenerApplication(req, res);
    if (method === 'GET' && url.pathname === '/v1/listener/application') return await getListenerApplication(req, res);
    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    if (error instanceof HttpError) { sendJson(res, error.status, { error: error.code }); return; }
    console.error(error);
    sendJson(res, 500, { error: 'internal_error' });
  }
}
