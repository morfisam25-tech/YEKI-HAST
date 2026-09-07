import type { IncomingMessage, ServerResponse } from 'node:http';
import { getPublicReleaseConfig } from '../services/api/src/lib/public-release.ts';
import { isCallerClosedBetaEnabled } from '../services/api/src/lib/caller-beta.ts';

const EXPECTED_MIGRATIONS = new Map([
  ['0001_initial.sql', 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09'],
  ['0002_email_auth.sql', '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90'],
  ['0003_internet_voice_transport.sql', '369ad1642a0cb2abe42f6b241c5024434b9308829ad31d697ca8f7edc7ec5225'],
  ['0004_booking.sql', '63f4070bdd1b6f89cca95eaa63a681ec31a246f13ac10a14ba814f98d887d4e3'],
  ['0005_no_answer_hold_idempotency.sql', '7456314e4969ba9536f21ca3c9de0ab4f665ba6f236cddea5832a43601b0ef3c'],
]);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(payload));
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.end(payload);
}

function logInternal(label: string, error?: unknown): void {
  const errorName = error instanceof Error ? error.name : error === undefined ? undefined : 'UnknownError';
  console.error(label, ...(errorName ? [{ errorName }] : []));
}

function releaseSha(): string | null {
  const value = process.env.YEKI_HAST_RELEASE_SHA?.trim().toLowerCase() ?? '';
  return /^[0-9a-f]{40}$/.test(value) ? value : null;
}

export function normalizedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (!isLocal) url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

async function loadPgPool(connectionString: string) {
  const pg = await import('pg');
  return new pg.Pool({
    connectionString: normalizedDatabaseUrl(connectionString),
    max: 2,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    const sha = releaseSha();
    sendJson(res, 200, {
      ok: true,
      service: 'yeki-hast-api',
      version: '0.0.10',
      ...(sha ? { releaseSha: sha } : {}),
      ...(url.pathname === '/' ? { endpoints: ['/health', '/ready', '/v1/bootstrap'] } : {}),
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/ready') {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      logInternal('readiness_database_url_missing');
      sendJson(res, 503, { ok: false, error: 'service_not_ready' });
      return;
    }

    let pool: Awaited<ReturnType<typeof loadPgPool>>;
    try {
      pool = await loadPgPool(connectionString);
    } catch (error) {
      logInternal('readiness_pg_import_failed', error);
      sendJson(res, 503, { ok: false, error: 'service_not_ready' });
      return;
    }

    try {
      const critical = await pool.query<{
        migrations_ready: boolean;
        users_ready: boolean;
        sessions_ready: boolean;
        pricing_ready: boolean;
        audit_ready: boolean;
        email_otp_ready: boolean;
        internet_voice_signals_ready: boolean;
        wallet_hold_events_ready: boolean;
        listener_availability_ready: boolean;
        call_reservations_ready: boolean;
      }>(`
        SELECT
          to_regclass('public.yeki_hast_schema_migrations') IS NOT NULL AS migrations_ready,
          to_regclass('app.users') IS NOT NULL AS users_ready,
          to_regclass('private_data.auth_sessions') IS NOT NULL AS sessions_ready,
          to_regclass('app.pricing_plans') IS NOT NULL AS pricing_ready,
          to_regclass('app.audit_logs') IS NOT NULL AS audit_ready,
          to_regclass('private_data.email_otp_challenges') IS NOT NULL AS email_otp_ready,
          to_regclass('app.internet_voice_signals') IS NOT NULL AS internet_voice_signals_ready,
          to_regclass('app.wallet_hold_events') IS NOT NULL AS wallet_hold_events_ready,
          to_regclass('app.listener_availability') IS NOT NULL AS listener_availability_ready,
          to_regclass('app.call_reservations') IS NOT NULL AS call_reservations_ready
      `);
      const row = critical.rows[0];
      const relationsReady = Boolean(
        row?.migrations_ready
        && row?.users_ready
        && row?.sessions_ready
        && row?.pricing_ready
        && row?.audit_ready
        && row?.email_otp_ready
        && row?.internet_voice_signals_ready
        && row?.wallet_hold_events_ready
        && row?.listener_availability_ready
        && row?.call_reservations_ready
      );
      if (!relationsReady) {
        console.error('readiness_schema_incomplete', {
          migrations: Boolean(row?.migrations_ready),
          users: Boolean(row?.users_ready),
          sessions: Boolean(row?.sessions_ready),
          pricing: Boolean(row?.pricing_ready),
          audit: Boolean(row?.audit_ready),
          emailOtp: Boolean(row?.email_otp_ready),
          internetVoiceSignals: Boolean(row?.internet_voice_signals_ready),
          walletHoldEvents: Boolean(row?.wallet_hold_events_ready),
          listenerAvailability: Boolean(row?.listener_availability_ready),
          callReservations: Boolean(row?.call_reservations_ready),
        });
        sendJson(res, 503, { ok: false, error: 'service_not_ready' });
        return;
      }

      const migrations = await pool.query<{ filename: string; sha256: string }>(`
        SELECT filename, sha256
        FROM public.yeki_hast_schema_migrations
        WHERE filename IN (
          '0001_initial.sql',
          '0002_email_auth.sql',
          '0003_internet_voice_transport.sql',
          '0004_booking.sql',
          '0005_no_answer_hold_idempotency.sql'
        )
      `);
      const migrationMap = new Map(migrations.rows.map((migration) => [migration.filename, migration.sha256]));
      for (const [filename, expectedSha] of EXPECTED_MIGRATIONS) {
        if (migrationMap.get(filename) !== expectedSha) {
          console.error('readiness_migration_integrity_mismatch', { filename });
          sendJson(res, 503, { ok: false, error: 'service_not_ready' });
          return;
        }
      }

      sendJson(res, 200, { ok: true, database: 'ready', schema: 'ready' });
    } catch (error) {
      logInternal('readiness_database_query_failed', error);
      sendJson(res, 503, { ok: false, error: 'service_not_ready' });
    } finally {
      await pool.end().catch(() => undefined);
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/bootstrap') {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      logInternal('bootstrap_database_url_missing');
      sendJson(res, 503, { error: 'service_not_ready' });
      return;
    }

    let pool: Awaited<ReturnType<typeof loadPgPool>>;
    try {
      pool = await loadPgPool(connectionString);
    } catch (error) {
      logInternal('bootstrap_pg_import_failed', error);
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
        WHERE p.code=$1
          AND s.code=$2 AND s.status='active'
          AND m.code=$3 AND m.is_active=true
          AND pp.is_active=true
        LIMIT 1
      `, [productCode, serviceCode, marketCode]);

      const languages = await pool.query<{ code: string; name_fa: string; name_en: string | null }>(
        'SELECT code, name_fa, name_en FROM app.languages WHERE is_active=true ORDER BY code',
      );

      const row = pricing.rows[0];
      if (!row) {
        console.error('bootstrap_active_market_pricing_missing', { productCode, serviceCode, marketCode });
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
        features: {
          callerClosedBetaEnabled: isCallerClosedBetaEnabled(),
        },
        legal: getPublicReleaseConfig(),
        languages: languages.rows.map((x) => ({ code: x.code, nameFa: x.name_fa, nameEn: x.name_en })),
      });
    } catch (error) {
      logInternal('bootstrap_database_query_failed', error);
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
    logInternal('backend_import_failed', error);
    sendJson(res, 500, { error: 'internal_error' });
  }
}