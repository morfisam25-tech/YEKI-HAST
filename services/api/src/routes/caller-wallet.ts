import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext } from '../lib/caller-market.ts';
import { sendJson } from '../lib/http.ts';

export async function getCallerWallet(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const context = await resolveCallerMarketContext(userId);
  const result = await query<{
    currency_code: string;
    balance_minor: string;
    reserved_minor: string;
    version: string;
  }>(`
    SELECT currency_code, balance_minor::text, reserved_minor::text, version::text
    FROM app.wallets
    WHERE user_id=$1
    ORDER BY (currency_code=$2) DESC, currency_code
  `, [userId, context.pricing.currencyCode]);

  const wallets = result.rows.map((row) => ({
    currencyCode: row.currency_code,
    balanceMinor: row.balance_minor,
    reservedMinor: row.reserved_minor,
    availableMinor: (BigInt(row.balance_minor) - BigInt(row.reserved_minor)).toString(),
    version: row.version,
    activeForCalls: row.currency_code === context.pricing.currencyCode,
  }));
  const hasActiveCurrency = wallets.some((wallet) => wallet.currencyCode === context.pricing.currencyCode);
  if (!hasActiveCurrency) {
    wallets.unshift({
      currencyCode: context.pricing.currencyCode,
      balanceMinor: '0',
      reservedMinor: '0',
      availableMinor: '0',
      version: '0',
      activeForCalls: true,
    });
  }

  sendJson(res, 200, {
    activeMarket: context.market,
    activeCurrencyCode: context.pricing.currencyCode,
    wallets,
  });
}
