import type { IncomingMessage, ServerResponse } from 'node:http';
import { getPublicReleaseConfig } from '../services/api/src/lib/public-release.ts';
import { isCallerClosedBetaEnabled } from '../services/api/src/lib/caller-beta.ts';

const EXPECTED_MIGRATIONS = new Map([
  ['0001_initial.sql', 'f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09'],
  ['0002_email_auth.sql', '3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90'],
  ['0003_internet_voice_transport.sql', '08fc87e2b1a12164b3078b99ca66b46d6db6003fb387fa79761bba92c34bff12'],
  ['0004_booking.sql', '63f4070bdd1b6f89cca95eaa63a681ec31a246f13ac10a14ba814f98d887d4e3'],
  ['0005_no_answer_hold_idempotency.sql', '7456314e4969ba9536f21ca3c9de0ab4f665ba6f236cddea5832a43601b0ef3c'],
  ['0006_internet_voice_server_sweeper.sql', '46c8bc4e07420d2ec64192d8ab2aee40f29a42083192d989bcc2bdfef4dfb72b'],
]);
const REQUIRED_W3_MIGRATIONS = [
  '0007_global_caller_market_feedback.sql',
  '0008_caller_quote_bindings.sql',
] as const;

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
      version: '0.0.11',
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
        call_ratings_ready: boolean;
        caller_favorites_ready: boolean;
        caller_quote_bindings_ready: boolean;
        caller_profile_market_ready: boolean;
        reservation_caller_market_ready: boolean;
        call_caller_market_ready: boolean;
        listener_currency_ready: boolean;
        platform_contribution_nullable_ready: boolean;
        quote_binding_columns_ready: boolean;
        call_rating_columns_ready: boolean;
        favorite_columns_ready: boolean;
        pg_cron_ready: boolean;
        pg_cron_database_ready: boolean;
        internet_voice_sweeper_ready: boolean;
        internet_voice_sweeper_ensure_ready: boolean;
        internet_voice_sweeper_stop_ready: boolean;
        internet_voice_liveness_columns_ready: boolean;
        internet_voice_liveness_settlement_ready: boolean;
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
          to_regclass('app.call_reservations') IS NOT NULL AS call_reservations_ready,
          to_regclass('app.call_ratings') IS NOT NULL AS call_ratings_ready,
          to_regclass('app.caller_favorite_listeners') IS NOT NULL AS caller_favorites_ready,
          to_regclass('app.caller_quote_bindings') IS NOT NULL AS caller_quote_bindings_ready,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='app' AND table_name='caller_profiles'
              AND column_name='market_id'
          ) AS caller_profile_market_ready,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='app' AND table_name='call_reservations'
              AND column_name='caller_market_id' AND is_nullable='NO'
          ) AS reservation_caller_market_ready,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='app' AND table_name='call_sessions'
              AND column_name='caller_market_id' AND is_nullable='NO'
          ) AS call_caller_market_ready,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='app' AND table_name='call_sessions'
              AND column_name='listener_currency_code' AND is_nullable='NO'
          ) AS listener_currency_ready,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='app' AND table_name='call_sessions'
              AND column_name='platform_contribution_minor' AND is_nullable='YES'
          ) AS platform_contribution_nullable_ready,
          (
            SELECT count(*)=9
            FROM information_schema.columns
            WHERE table_schema='app' AND table_name='caller_quote_bindings'
              AND column_name IN (
                'caller_user_id','caller_market_id','pricing_plan_id','quote_target',
                'max_billable_seconds','booking_id','authorized_minor','currency_code','expires_at'
              )
          ) AS quote_binding_columns_ready,
          (
            SELECT count(*)=5
            FROM information_schema.columns
            WHERE table_schema='app' AND table_name='call_ratings'
              AND column_name IN ('call_session_id','caller_user_id','listener_user_id','service_id','rating')
          ) AS call_rating_columns_ready,
          (
            SELECT count(*)=2
            FROM information_schema.columns
            WHERE table_schema='app' AND table_name='caller_favorite_listeners'
              AND column_name IN ('caller_user_id','listener_user_id')
          ) AS favorite_columns_ready,
          EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS pg_cron_ready,
          current_setting('cron.database_name', true)=current_database() AS pg_cron_database_ready,
          to_regprocedure('app.sweep_internet_voice_sessions(integer)') IS NOT NULL AS internet_voice_sweeper_ready,
          to_regprocedure('app.ensure_internet_voice_sweeper_job()') IS NOT NULL AS internet_voice_sweeper_ensure_ready,
          to_regprocedure('app.stop_internet_voice_sweeper_if_idle()') IS NOT NULL AS internet_voice_sweeper_stop_ready,
          (
            SELECT count(*)=2
            FROM information_schema.columns
            WHERE table_schema='app'
              AND table_name='call_sessions'
              AND column_name IN ('caller_voice_heartbeat_at','listener_voice_heartbeat_at')
          ) AS internet_voice_liveness_columns_ready,
          to_regprocedure('app.settle_internet_voice_call(uuid,text,text,boolean,timestamptz)') IS NOT NULL
            AS internet_voice_liveness_settlement_ready
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
        && row?.call_ratings_ready
        && row?.caller_favorites_ready
        && row?.caller_quote_bindings_ready
        && row?.caller_profile_market_ready
        && row?.reservation_caller_market_ready
        && row?.call_caller_market_ready
        && row?.listener_currency_ready
        && row?.platform_contribution_nullable_ready
        && row?.quote_binding_columns_ready
        && row?.call_rating_columns_ready
        && row?.favorite_columns_ready
        && row?.pg_cron_ready
        && row?.pg_cron_database_ready
        && row?.internet_voice_sweeper_ready
        && row?.internet_voice_sweeper_ensure_ready
        && row?.internet_voice_sweeper_stop_ready
        && row?.internet_voice_liveness_columns_ready
        && row?.internet_voice_liveness_settlement_ready
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
          callRatings: Boolean(row?.call_ratings_ready),
          callerFavorites: Boolean(row?.caller_favorites_ready),
          callerQuoteBindings: Boolean(row?.caller_quote_bindings_ready),
          callerProfileMarket: Boolean(row?.caller_profile_market_ready),
          reservationCallerMarket: Boolean(row?.reservation_caller_market_ready),
          callCallerMarket: Boolean(row?.call_caller_market_ready),
          listenerCurrency: Boolean(row?.listener_currency_ready),
          platformContributionNullable: Boolean(row?.platform_contribution_nullable_ready),
          quoteBindingColumns: Boolean(row?.quote_binding_columns_ready),
          callRatingColumns: Boolean(row?.call_rating_columns_ready),
          favoriteColumns: Boolean(row?.favorite_columns_ready),
          pgCron: Boolean(row?.pg_cron_ready),
          pgCronDatabase: Boolean(row?.pg_cron_database_ready),
          internetVoiceSweeper: Boolean(row?.internet_voice_sweeper_ready),
          internetVoiceSweeperEnsure: Boolean(row?.internet_voice_sweeper_ensure_ready),
          internetVoiceSweeperStop: Boolean(row?.internet_voice_sweeper_stop_ready),
          internetVoiceLivenessColumns: Boolean(row?.internet_voice_liveness_columns_ready),
          internetVoiceLivenessSettlement: Boolean(row?.internet_voice_liveness_settlement_ready),
        });
        sendJson(res, 503, { ok: false, error: 'service_not_ready' });
        return;
      }

      const scheduler = await pool.query<{
        active_voice_calls: string;
        valid_jobs: string;
        invalid_jobs: string;
      }>(`
        SELECT
          (
            SELECT count(*)::text
            FROM app.call_sessions
            WHERE transport='internet_voice'
              AND status IN ('calling_listener','connected')
          ) AS active_voice_calls,
          (
            SELECT count(*)::text
            FROM cron.job
            WHERE jobname='yeki_hast_internet_voice_sweep'
              AND schedule='10 seconds'
              AND active=true
              AND database=current_database()
              AND command='SELECT * FROM app.sweep_internet_voice_sessions(100);'
          ) AS valid_jobs,
          (
            SELECT count(*)::text
            FROM cron.job
            WHERE jobname='yeki_hast_internet_voice_sweep'
              AND NOT (
                schedule='10 seconds'
                AND active=true
                AND database=current_database()
                AND command='SELECT * FROM app.sweep_internet_voice_sessions(100);'
              )
          ) AS invalid_jobs
      `);
      const schedulerRow = scheduler.rows[0];
      const activeVoiceCalls = Number(schedulerRow?.active_voice_calls ?? '0');
      const validJobs = Number(schedulerRow?.valid_jobs ?? '0');
      const invalidJobs = Number(schedulerRow?.invalid_jobs ?? '0');
      if (
        !Number.isSafeInteger(activeVoiceCalls)
        || !Number.isSafeInteger(validJobs)
        || !Number.isSafeInteger(invalidJobs)
        || activeVoiceCalls < 0
        || validJobs < 0
        || invalidJobs < 0
        || invalidJobs > 0
        || validJobs > 1
        || (activeVoiceCalls > 0 && validJobs !== 1)
      ) {
        console.error('readiness_internet_voice_sweeper_job_invalid', {
          activeVoiceCalls,
          validJobs,
          invalidJobs,
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
          '0005_no_answer_hold_idempotency.sql',
          '0006_internet_voice_server_sweeper.sql',
          '0007_global_caller_market_feedback.sql',
          '0008_caller_quote_bindings.sql'
        )
      `);
      const migrationMap = new Map(
        migrations.rows.map((migration) => [migration.filename, migration.sha256]),
      );
      for (const [filename, expectedSha] of EXPECTED_MIGRATIONS) {
        if (migrationMap.get(filename) !== expectedSha) {
          console.error('readiness_migration_integrity_mismatch', { filename });
          sendJson(res, 503, { ok: false, error: 'service_not_ready' });
          return;
        }
      }
      for (const filename of REQUIRED_W3_MIGRATIONS) {
        const sha = migrationMap.get(filename);
        if (!sha || !/^[0-9a-f]{64}$/i.test(sha)) {
          console.error('readiness_w3_migration_missing', { filename });
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

      const languages = await pool.query<{
        code: string;
        name_fa: string;
        name_en: string | null;
      }>(
        'SELECT code, name_fa, name_en FROM app.languages WHERE is_active=true ORDER BY code',
      );

      const row = pricing.rows[0];
      if (!row) {
        console.error('bootstrap_active_market_pricing_missing', {
          productCode,
          serviceCode,
          marketCode,
        });
        sendJson(res, 503, { error: 'active_market_pricing_missing' });
        return;
      }

      sendJson(res, 200, {
        brandName: row.brand_name,
        market: {
          code: row.market_code,
          countryCode: row.country_code,
          timezone: row.timezone,
        },
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
        languages: languages.rows.map((x) => ({
          code: x.code,
          nameFa: x.name_fa,
          nameEn: x.name_en,
        })),
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
