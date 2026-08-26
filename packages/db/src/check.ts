import { closePool, query } from './client.ts';

async function main() {
  const db = await query<{ now: string }>('SELECT now()::text AS now');
  const price = await query<{
    product_code: string;
    service_code: string;
    market_code: string;
    currency_code: string;
    caller_rate_per_minute_minor: string;
    listener_rate_per_minute_minor: string;
    platform_spread_per_minute_minor: string;
  }>(`
    SELECT p.code product_code, s.code service_code, m.code market_code,
           pp.currency_code, pp.caller_rate_per_minute_minor::text,
           pp.listener_rate_per_minute_minor::text,
           pp.platform_spread_per_minute_minor::text
    FROM app.pricing_plans pp
    JOIN app.products p ON p.id=pp.product_id
    JOIN app.service_catalog s ON s.id=pp.service_id
    JOIN app.markets m ON m.id=pp.market_id
    WHERE pp.is_active=true
  `);
  console.log(JSON.stringify({ ok: true, dbTime: db.rows[0]?.now, activePricing: price.rows }, null, 2));
}

main().finally(closePool).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
