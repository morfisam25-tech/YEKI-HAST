import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest } from '../services/api/src/handler.ts';

export default async function runtimeHandler(req: IncomingMessage, res: ServerResponse) {
  return handleApiRequest(req, res);
}
