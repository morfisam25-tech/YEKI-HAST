import type { IncomingMessage, ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { authorizationMinorForSeconds, requireWave1SessionCapSeconds } from '../domain/session-policy.ts';
import { requireAuth } from '../lib/auth.ts';
import { resolveCallerMarketContext } from '../lib/caller-market.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: string | null, code: string): string | null {
  if (!value) return null;
  if (!UUID_RE.test(value)) throw new HttpError(400, code);
  return value;
}

function seconds(value: string | null): number | null {
  if (value === null) return null;
  try { return requireWave1SessionCapSeconds(Number(value)); }
  catch { throw new HttpError(400, 'invalid_session_cap'); }
}

function display(currencyCode: string) {
  return {
    displayUnit: currencyCode === 'IRR' ? 'toman' as const : 'currency' as const,
    displayDivisor: currencyCode === 'IRR' ? 10 : 1,
  };
}

export async function getCallerQuote(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const maxSeconds = seconds(url.searchParams.get('maxSeconds'));
  const bookingId = uuid(url.searchParams.get('bookingId'), 'invalid_booking');
  const callId = uuid(url.searchParams.get('callId'), 'invalid_call');
  const targets = Number(maxSeconds !== null) + Number(Boolean(bookingId)) + Number(Boolean(callId));
  if (targets !== 1) throw new HttpError(400, 'invalid_quote_target');

  if (callId) {
    const call = await query<{
      call_id: string;
      caller_market_id: string;
      market_code: string;
      country_code: string;
      default_timezone: string;
      pricing_plan_id: string;
      currency_code: string;
      caller_rate: string;
      authorized_minor: string;
      max_billable_seconds: number | null;
      listener_currency_code: string;
      listener_rate: string;
    }>(`
      SELECT cs.id::text call_id,
             cs.caller_market_id::text,
             m.code market_code,
             m.country_code,
             m.default_timezone,
             cs.pricing_plan_id::text,
             cs.currency_code,
             cs.caller_rate_per_minute_minor::text caller_rate,
             cs.authorized_minor::text,
             cs.max_billable_seconds,
             cs.listener_currency_code,
             cs.listener_rate_per_minute_minor::text listener_rate
      FROM app.call_sessions cs
      JOIN app.markets m ON m.id=cs.caller_market_id
      WHERE cs.id=$1 AND cs.caller_user_id=$2
      LIMIT 1
    `, [callId, userId]);
    const row = call.rows[0];
    if (!row || !row.max_billable_seconds || !row.pricing_plan_id) throw new HttpError(404, 'call_not_found');

    const wallet = await query<{ balance_minor: string; reserved_minor: string }>(`
      SELECT balance_minor::text, reserved_minor::text
      FROM app.wallets
      WHERE user_id=$1 AND currency_code=$2
      LIMIT 1
    `, [userId, row.currency_code]);
    const balance = BigInt(wallet.rows[0]?.balance_minor ?? '0');
    const reserved = BigInt(wallet.rows[0]?.reserved_minor ?? '0');

    sendJson(res, 200, {
      market: {
        id: row.caller_market_id,
        code: row.market_code,
        countryCode: row.country_code,
        timezone: row.default_timezone,
      },
      pricing: {
        pricingPlanId: row.pricing_plan_id,
        currencyCode: row.currency_code,
        callerRatePerMinuteMinor: Number(row.caller_rate),
        billingIncrementSeconds: null,
        ...display(row.currency_code),
      },
      listenerBase: {
        currencyCode: row.listener_currency_code,
        ratePerMinuteMinor: Number(row.listener_rate),
        callerCountryIndependent: true,
      },
      session: {
        maxBillableSeconds: row.max_billable_seconds,
        authorizedMinor: row.authorized_minor,
        reservedAlready: true,
      },
      wallet: {
        currencyCode: row.currency_code,
        balanceMinor: balance.toString(),
        reservedMinor: reserved.toString(),
        availableMinor: (balance - reserved).toString(),
        enough: true,
      },
    });
    return;
  }

  const context = await resolveCallerMarketContext(userId);
  let quoteSeconds = maxSeconds;
  if (bookingId) {
    const booking = await query<{
      max_billable_seconds: number;
      caller_market_id: string;
    }>(`
      SELECT max_billable_seconds, caller_market_id::text
      FROM app.call_reservations
      WHERE id=$1 AND caller_user_id=$2
      LIMIT 1
    `, [bookingId, userId]);
    const row = booking.rows[0];
    if (!row) throw new HttpError(404, 'booking_not_found');
    if (row.caller_market_id !== context.market.id) throw new HttpError(409, 'booking_market_changed');
    quoteSeconds = requireWave1SessionCapSeconds(row.max_billable_seconds);
  }
  if (quoteSeconds === null) throw new HttpError(400, 'invalid_quote_target');

  const authorized = authorizationMinorForSeconds(context.pricing.callerRatePerMinuteMinor, quoteSeconds);
  const wallet = await query<{ balance_minor: string; reserved_minor: string }>(`
    SELECT balance_minor::text, reserved_minor::text
    FROM app.wallets
    WHERE user_id=$1 AND currency_code=$2
    LIMIT 1
  `, [userId, context.pricing.currencyCode]);
  const balance = BigInt(wallet.rows[0]?.balance_minor ?? '0');
  const reserved = BigInt(wallet.rows[0]?.reserved_minor ?? '0');
  const available = balance - reserved;

  sendJson(res, 200, {
    market: context.market,
    marketplace: context.marketplace,
    pricing: {
      pricingPlanId: context.pricing.id,
      currencyCode: context.pricing.currencyCode,
      callerRatePerMinuteMinor: Number(context.pricing.callerRatePerMinuteMinor),
      billingIncrementSeconds: context.pricing.billingIncrementSeconds,
      ...display(context.pricing.currencyCode),
    },
    listenerBase: {
      currencyCode: context.listenerBase.currencyCode,
      ratePerMinuteMinor: Number(context.listenerBase.ratePerMinuteMinor),
      callerCountryIndependent: true,
    },
    session: {
      maxBillableSeconds: quoteSeconds,
      authorizedMinor: authorized.toString(),
      reservedAlready: false,
    },
    wallet: {
      currencyCode: context.pricing.currencyCode,
      balanceMinor: balance.toString(),
      reservedMinor: reserved.toString(),
      availableMinor: available.toString(),
      enough: available >= authorized,
    },
  });
}
