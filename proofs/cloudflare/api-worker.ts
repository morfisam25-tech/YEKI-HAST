import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { handleApiRequest } from '../../services/api/src/handler.ts';

// W12 compatibility proof only. This file is intentionally isolated from the
// production Vercel entrypoints and is never referenced by production config.
const server = createServer((req, res) => {
  void handleApiRequest(req, res).catch((error: unknown) => {
    console.error('w12_cloudflare_api_unhandled', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
    }
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'internal_error' }));
  });
});

export default httpServerHandler(server);
