import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireAuth } from '../lib/auth.ts';
import { requireCurrentCallerAgeAssertion } from './caller.ts';
import { createWalletTopup } from './payments.ts';

export async function createCallerWalletTopup(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await requireCurrentCallerAgeAssertion(userId);
  return createWalletTopup(req, res);
}
