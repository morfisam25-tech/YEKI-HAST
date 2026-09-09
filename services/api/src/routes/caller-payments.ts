import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext } from '../lib/caller-market.ts';
import { HttpError } from '../lib/http.ts';
import { requireCurrentCallerAgeAssertion } from './caller.ts';
import { createWalletTopup } from './payments.ts';

export async function createCallerWalletTopup(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  await requireCurrentCallerAgeAssertion(userId);
  const context = await resolveCallerMarketContext(userId);

  // The currently implemented provider is the Iran IRR rail. A foreign Caller must never
  // be silently sent through it or credited into an IRR wallet. W6 can add foreign rails
  // independently once a provider is actually approved/configured.
  if (context.market.code !== 'ir' || context.pricing.currencyCode !== 'IRR') {
    throw new HttpError(503, 'payment_rail_unavailable_for_market');
  }
  return createWalletTopup(req, res);
}
