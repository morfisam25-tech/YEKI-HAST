import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext } from '../lib/caller-market.ts';
import { browseListeners } from './marketplace.ts';
import { browseBookableListeners } from './booking-discovery.ts';
import { getListenerBookableAvailability } from './bookings.ts';

async function requireCallerMarket(req: IncomingMessage): Promise<void> {
  const { userId } = await requireAuth(req);
  await resolveCallerMarketContext(userId);
}

export async function browseCallerListeners(req: IncomingMessage, res: ServerResponse) {
  await requireCallerMarket(req);
  return browseListeners(req, res);
}

export async function browseCallerBookableListeners(req: IncomingMessage, res: ServerResponse) {
  await requireCallerMarket(req);
  return browseBookableListeners(req, res);
}

export async function getCallerListenerAvailability(
  req: IncomingMessage,
  res: ServerResponse,
  listenerId: string,
) {
  await requireCallerMarket(req);
  return getListenerBookableAvailability(req, res, listenerId);
}
