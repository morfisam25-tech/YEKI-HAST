import type { ServerResponse } from 'node:http';
import { query } from '../../../../packages/db/src/client.ts';
import { sendJson } from '../lib/http.ts';
import { getDefaultOperatingContextCodes } from '../lib/operating-context.ts';

export async function bootstrap(res: ServerResponse) {
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();
  const result = await query<{
    brand_name: string;
    market_code: string;
    country_code: string;
    timezone: string;
    currency_code: string;
    caller_rate: string;
    listener_rate: string;
    spread: string;
    billing_increment_seconds: number;
  }>(`
    SELECT p.brand_name, m.code market_code, m.country_code, m.default_timezone timezone,
           pp.currency_code, pp.caller_rate_per_minute_minor::text caller_rate,
           pp.listener_rate_per_minute_minor::text listener_rate,
           pp.platform_spread_per_minute_minor::text spread,
           pp.billing_increment_seconds
    FROM app.pricing_plans pp
    JOIN app.products p ON p.id=pp.product_id
    JOIN app.service_catalog s ON s.id=pp.service_id
    JOIN app.markets m ON m.id=pp.market_id
    WHERE p.code=$1 AND s.code=$2 AND m.code=$3 AND pp.is_active=true
    LIMIT 1
  `, [productCode, serviceCode, marketCode]);
  const languages = await query<{ code: string; name_fa: string; name_en: string | null }>(
    'SELECT code, name_fa, name_en FROM app.languages WHERE is_active=true ORDER BY code',
  );
  const row = result.rows[0];
  if (!row) return sendJson(res, 503, { error: 'active_market_pricing_missing' });
  sendJson(res, 200, {
    brandName: row.brand_name,
    market: { code: row.market_code, countryCode: row.country_code, timezone: row.timezone },
    pricing: {
      currencyCode: row.currency_code,
      callerRatePerMinuteMinor: Number(row.caller_rate),
      listenerRatePerMinuteMinor: Number(row.listener_rate),
      platformGrossSpreadPerMinuteMinor: Number(row.spread),
      billingIncrementSeconds: row.billing_increment_seconds,
      displayUnit: row.currency_code === 'IRR' ? 'toman' : 'currency',
      displayDivisor: row.currency_code === 'IRR' ? 10 : 1,
    },
    features: {
      callerClosedBetaEnabled: process.env.CALLER_CLOSED_BETA_ENABLED?.trim().toLowerCase() === 'true',
    },
    languages: languages.rows.map((x) => ({ code: x.code, nameFa: x.name_fa, nameEn: x.name_en })),
  });
}
