import type { IncomingMessage, ServerResponse } from 'node:http';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(payload));
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

async function loadPgPool(connectionString: string) {
  const pg = await import('pg');
  return new pg.Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(res, 200, {
      ok: true,
      service: 'yeki-hast-api',
      version: '0.0.8',
      ...(url.pathname === '/' ? { endpoints: ['/health', '/ready', '/v1/bootstrap'] } : {}),
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/ready') {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      sendJson(res, 503, { ok: false, error: 'service_not_ready' });
      return;
    }

    let pool: Awaited<ReturnType<typeof loadPgPool>>;
    try {
      pool = await loadPgPool(connectionString);
    } catch (error) {
      console.error('readiness_pg_import_failed', error);
      sendJson(res, 503, { ok: false, error: 'service_not_ready' });
      return;
    }

    try {
      await pool.query('SELECT 1');
      sendJson(res, 200, { ok: true, database: 'ready' });
    } catch (error) {
      console.error('readiness_database_query_failed', error);
      sendJson(res, 503, { ok: false, error: 'service_not_ready' });
    } finally {
      await pool.end().catch(() => undefined);
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/bootstrap') {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      sendJson(res, 503, { error: 'service_not_ready' });
      return;
    }

    let pool: Awaited<ReturnType<typeof loadPgPool>>;
    try {
      pool = await loadPgPool(connectionString);
    } catch (error) {
      console.error('bootstrap_pg_import_failed', error);
      sendJson(res, 503, { error: 'service_not_ready' });
      return;
    }

    try {
      const productCode = process.env.DEFAULT_PRODUCT_CODE ?? 'yeki_hast';
      const serviceCode = process.env.DEFAULT_SERVICE_CODE ?? 'human_listening';
      const marketCode = process.env.DEFAULT_MARKET_CODE ?? 'ir';

      const pricing = await pool.query<{
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

      const languages = await pool.query<{ code: string; name_fa: string; name_en: string | null }>(
        'SELECT code, name_fa, name_en FROM app.languages WHERE is_active=true ORDER BY code',
      );

      const row = pricing.rows[0];
      if (!row) {
        sendJson(res, 503, { error: 'active_market_pricing_missing' });
        return;
      }

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
        languages: languages.rows.map((x) => ({ code: x.code, nameFa: x.name_fa, nameEn: x.name_en })),
      });
    } catch (error) {
      console.error('bootstrap_database_query_failed', error);
      sendJson(res, 500, { error: 'internal_error' });
    } finally {
      await pool.end().catch(() => undefined);
    }
    return;
  }

  try {
    const { handleApiRequest } = await import('../services/api/src/handler.ts');
    return await handleApiRequest(req, res);
  } catch (error) {
    console.error('backend_import_failed', error);
    sendJson(res, 500, { error: 'internal_error' });
  }
}
