import type { IncomingMessage, ServerResponse } from 'node:http';
import { isInternalOwnerTestMode } from '../services/api/src/lib/internal-owner-test.ts';

export default async function runtimeHandler(req: IncomingMessage, res: ServerResponse) {
  // Bind Preview owner-test traffic to its dedicated database before loading
  // any route module that can import or acquire the shared database pool.
  // Production and ordinary Preview requests leave DATABASE_URL unchanged.
  isInternalOwnerTestMode();
  const { handleApiRequest } = await import('../services/api/src/handler.ts');
  return handleApiRequest(req, res);
}
