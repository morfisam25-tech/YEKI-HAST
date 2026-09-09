import { query } from '../../../../packages/db/src/client.ts';
import { HttpError } from './http.ts';
import { getDefaultOperatingContextCodes } from './operating-context.ts';

type QueryResult = { rows: any[]; rowCount: number | null };
export type SqlRunner = { query: (text: string, values?: any[]) => Promise<QueryResult> };

const poolRunner: SqlRunner = {
  query: (text, values) => query(text, values),
};

export type CallerMarketContext = {
  product: { id: string; code: string };
  service: { id: string; code: string };
  marketplace: { id: string; code: string };
  market: {
    id: string;
    code: string;
    countryCode: string;
    timezone: string;
  };
  pricing: {
    id: string;
    currencyCode: string;
    callerRatePerMinuteMinor: bigint;
    platformGrossSpreadPerMinuteMinor: bigint;
    billingIncrementSeconds: number;
  };
  listenerBase: {
    pricingPlanId: string;
    currencyCode: string;
    ratePerMinuteMinor: bigint;
  };
};

function publicMarketCode(value: unknown): string {
  const code = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,24}$/.test(code)) throw new HttpError(400, 'invalid_market');
  return code;
}

export function parseCallerMarketCode(value: unknown): string {
  return publicMarketCode(value);
}

export async function resolveCallerMarketContext(
  userId: string,
  runner: SqlRunner = poolRunner,
): Promise<CallerMarketContext> {
  const { productCode, serviceCode, marketCode: marketplaceMarketCode } = getDefaultOperatingContextCodes();

  const profile = await runner.query(`
    SELECT cp.market_id::text market_id,
           m.code market_code,
           m.country_code,
           m.default_timezone
    FROM app.caller_profiles cp
    LEFT JOIN app.markets m ON m.id=cp.market_id
    WHERE cp.user_id=$1
    LIMIT 1
  `, [userId]);
  const selected = profile.rows[0];
  if (!selected?.market_id) throw new HttpError(409, 'caller_market_required');
  if (!selected.market_code) throw new HttpError(503, 'caller_market_unavailable');

  const context = await runner.query(`
    SELECT p.id::text product_id,
           s.id::text service_id,
           marketplace.id::text marketplace_market_id,
           caller_market.id::text caller_market_id,
           caller_market.code caller_market_code,
           caller_market.country_code,
           caller_market.default_timezone,
           pp.id::text pricing_plan_id,
           pp.currency_code,
           pp.caller_rate_per_minute_minor::text caller_rate,
           pp.platform_spread_per_minute_minor::text platform_spread,
           pp.billing_increment_seconds,
           listener_pp.id::text listener_pricing_plan_id,
           listener_pp.currency_code listener_currency_code,
           listener_pp.listener_rate_per_minute_minor::text listener_rate
    FROM app.products p
    JOIN app.service_catalog s ON s.code=$2 AND s.status='active'
    JOIN app.markets marketplace ON marketplace.code=$3 AND marketplace.is_active=true
    JOIN app.markets caller_market ON caller_market.id=$4::uuid AND caller_market.is_active=true
    JOIN app.pricing_plans pp
      ON pp.product_id=p.id
      AND pp.service_id=s.id
      AND pp.market_id=caller_market.id
      AND pp.is_active=true
    JOIN app.pricing_plans listener_pp
      ON listener_pp.product_id=p.id
      AND listener_pp.service_id=s.id
      AND listener_pp.market_id=marketplace.id
      AND listener_pp.is_active=true
    WHERE p.code=$1
    ORDER BY pp.id, listener_pp.id
    LIMIT 3
  `, [productCode, serviceCode, marketplaceMarketCode, selected.market_id]);

  if (context.rows.length === 0) throw new HttpError(503, 'caller_market_pricebook_unavailable');
  if (context.rows.length !== 1) throw new HttpError(503, 'caller_market_pricebook_ambiguous');
  const row = context.rows[0];

  const callerRate = BigInt(row.caller_rate);
  const platformSpread = BigInt(row.platform_spread);
  const listenerRate = BigInt(row.listener_rate);
  const billingIncrementSeconds = Number(row.billing_increment_seconds);
  if (callerRate <= 0n || listenerRate <= 0n || platformSpread < 0n) {
    throw new HttpError(503, 'caller_market_pricebook_invalid');
  }
  if (!Number.isInteger(billingIncrementSeconds) || billingIncrementSeconds < 1 || billingIncrementSeconds > 60) {
    throw new HttpError(503, 'caller_market_pricebook_invalid');
  }

  // Blueprint v1.2 locks the Iran base economics. If production data drifts, fail closed
  // instead of silently quoting or reserving the wrong amount.
  if (row.caller_market_code === 'ir') {
    if (
      row.currency_code !== 'IRR'
      || callerRate !== 40_000n
      || row.listener_currency_code !== 'IRR'
      || listenerRate !== 28_000n
      || platformSpread !== 12_000n
    ) {
      throw new HttpError(503, 'iran_pricebook_mismatch');
    }
  }

  return {
    product: { id: row.product_id, code: productCode },
    service: { id: row.service_id, code: serviceCode },
    marketplace: { id: row.marketplace_market_id, code: marketplaceMarketCode },
    market: {
      id: row.caller_market_id,
      code: row.caller_market_code,
      countryCode: row.country_code,
      timezone: row.default_timezone,
    },
    pricing: {
      id: row.pricing_plan_id,
      currencyCode: row.currency_code,
      callerRatePerMinuteMinor: callerRate,
      platformGrossSpreadPerMinuteMinor: platformSpread,
      billingIncrementSeconds,
    },
    listenerBase: {
      pricingPlanId: row.listener_pricing_plan_id,
      currencyCode: row.listener_currency_code,
      ratePerMinuteMinor: listenerRate,
    },
  };
}

export async function listConfiguredCallerMarkets(runner: SqlRunner = poolRunner) {
  const { productCode, serviceCode } = getDefaultOperatingContextCodes();
  const result = await runner.query(`
    SELECT m.id::text,
           m.code,
           m.country_code,
           m.default_timezone,
           MIN(pp.currency_code) currency_code,
           COUNT(pp.id)::int active_pricebook_count
    FROM app.markets m
    JOIN app.products p ON p.code=$1
    JOIN app.service_catalog s ON s.code=$2 AND s.status='active'
    JOIN app.pricing_plans pp
      ON pp.product_id=p.id
      AND pp.service_id=s.id
      AND pp.market_id=m.id
      AND pp.is_active=true
    WHERE m.is_active=true
    GROUP BY m.id,m.code,m.country_code,m.default_timezone
    HAVING COUNT(pp.id)=1
    ORDER BY (m.code='ir') DESC, m.code
  `, [productCode, serviceCode]);
  return result.rows.map((row) => ({
    id: row.id as string,
    code: row.code as string,
    countryCode: row.country_code as string,
    timezone: row.default_timezone as string,
    currencyCode: row.currency_code as string,
  }));
}

export async function requireConfiguredCallerMarket(
  marketCodeInput: unknown,
  runner: SqlRunner = poolRunner,
) {
  const marketCode = parseCallerMarketCode(marketCodeInput);
  const markets = await listConfiguredCallerMarkets(runner);
  const market = markets.find((item) => item.code === marketCode);
  if (!market) throw new HttpError(409, 'caller_market_pricebook_unavailable');
  return market;
}
