import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateEnv } from '../services/api/src/lib/env.ts';
import { handleApiRequest } from '../services/api/src/handler.ts';

validateEnv();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return handleApiRequest(req, res);
}
