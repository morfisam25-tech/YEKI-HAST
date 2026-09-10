import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext } from '../lib/caller-market.ts';
import { HttpError } from '../lib/http.ts';
import { browseListeners } from './marketplace.ts';
import { browseBookableListeners } from './booking-discovery.ts';
import { getListenerBookableAvailability } from './bookings.ts';

async function validateCallerMarketWhenSelected(req: IncomingMessage): Promise<void> {
  const { userId } = await requireAuth(req);
  try {
    await resolveCallerMarketContext(userId);
  } catch (error) {
    // Discovery is one shared Persian marketplace and is not segmented by Caller country.
    // A brand-new Caller may browse before explicitly choosing a billing market. Once a
    // market is persisted, an invalid/inactive pricebook must fail closed even for discovery.
    if (error instanceof HttpError && error.code === 'caller_market_required') return;
    throw error;
  }
}

export async function browseCallerListeners(req: IncomingMessage, res: ServerResponse) {
  await validateCallerMarketWhenSelected(req);
  return browseListeners(req, res);
}

export async function browseCallerBookableListeners(req: IncomingMessage, res: ServerResponse) {
  await validateCallerMarketWhenSelected(req);
  return browseBookableListeners(req, res);
}

export async function getCallerListenerAvailability(
  req: IncomingMessage,
  res: ServerResponse,
  listenerId: string,
) {
  await validateCallerMarketWhenSelected(req);
  return getListenerBookableAvailability(req, res, listenerId);
}
