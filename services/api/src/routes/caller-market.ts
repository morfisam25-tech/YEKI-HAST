import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import {
  listConfiguredCallerMarkets,
  requireConfiguredCallerMarket,
  resolveCallerMarketContext,
  type SqlRunner,
} from '../lib/caller-market.ts';
import { HttpError, readJson, sendJson } from '../lib/http.ts';
import { getPublicReleaseConfig } from '../lib/public-release.ts';
import { getCallTransportReadiness } from '../providers/call-transport.ts';

const ACTIVE_CALL_STATUSES = ['requested', 'routing', 'calling_caller', 'caller_answered', 'calling_listener', 'connected'];

export async function getCallerMarket(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const [availableMarkets, current] = await Promise.all([
    listConfiguredCallerMarkets(),
    query<{
      id: string;
      code: string;
      country_code: string;
      default_timezone: string;
    }>(`
      SELECT m.id::text, m.code, m.country_code, m.default_timezone
      FROM app.caller_profiles cp
      JOIN app.markets m ON m.id=cp.market_id
      WHERE cp.user_id=$1
      LIMIT 1
    `, [userId]),
  ]);

  const row = current.rows[0];
  const currentMarket = row ? {
    id: row.id,
    code: row.code,
    countryCode: row.country_code,
    timezone: row.default_timezone,
    configured: availableMarkets.some((item) => item.id === row.id),
  } : null;

  sendJson(res, 200, { currentMarket, availableMarkets });
}

export async function setCallerMarket(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const body = await readJson<{ marketCode?: unknown }>(req);

  const selected = await withTransaction(async (client) => {
    const runner = client as unknown as SqlRunner;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('yeki_hast:caller_market:' || $1::text, 0))",
      [userId],
    );
    const market = await requireConfiguredCallerMarket(body.marketCode, runner);

    const current = await client.query<{ market_id: string | null }>(`
      SELECT market_id::text
      FROM app.caller_profiles
      WHERE user_id=$1
      FOR UPDATE
    `, [userId]);
    const currentMarketId = current.rows[0]?.market_id ?? null;

    if (currentMarketId && currentMarketId !== market.id) {
      const activeCall = await client.query(`
        SELECT 1
        FROM app.call_sessions
        WHERE caller_user_id=$1 AND status::text = ANY($2::text[])
        LIMIT 1
      `, [userId, ACTIVE_CALL_STATUSES]);
      const activeBooking = await client.query(`
        SELECT 1
        FROM app.call_reservations
        WHERE caller_user_id=$1 AND status IN ('booked','initiated')
        LIMIT 1
      `, [userId]);
      if (activeCall.rowCount || activeBooking.rowCount) {
        throw new HttpError(409, 'caller_market_change_blocked');
      }
    }

    await client.query(
      "INSERT INTO app.user_roles(user_id, role) VALUES ($1,'caller') ON CONFLICT DO NOTHING",
      [userId],
    );
    await client.query(`
      INSERT INTO app.caller_profiles(user_id, market_id)
      VALUES ($1,$2)
      ON CONFLICT (user_id) DO UPDATE SET market_id=EXCLUDED.market_id
    `, [userId, market.id]);

    return market;
  });

  sendJson(res, 200, { ok: true, market: selected });
}

export async function getCallerBootstrap(req: IncomingMessage, res: ServerResponse) {
  const { userId } = await requireAuth(req);
  const context = await resolveCallerMarketContext(userId);
  const [brand, languages] = await Promise.all([
    query<{ brand_name: string }>('SELECT brand_name FROM app.products WHERE id=$1', [context.product.id]),
    query<{ code: string; name_fa: string; name_en: string | null }>(
      'SELECT code, name_fa, name_en FROM app.languages WHERE is_active=true ORDER BY code',
    ),
  ]);
  if (!brand.rows[0]) throw new HttpError(503, 'product_unavailable');

  const transport = getCallTransportReadiness();
  sendJson(res, 200, {
    brandName: brand.rows[0].brand_name,
    market: context.market,
    pricing: {
      pricingPlanId: context.pricing.id,
      currencyCode: context.pricing.currencyCode,
      callerRatePerMinuteMinor: Number(context.pricing.callerRatePerMinuteMinor),
      platformGrossSpreadPerMinuteMinor: Number(context.pricing.platformGrossSpreadPerMinuteMinor),
      billingIncrementSeconds: context.pricing.billingIncrementSeconds,
      displayUnit: context.pricing.currencyCode === 'IRR' ? 'toman' : 'currency',
      displayDivisor: context.pricing.currencyCode === 'IRR' ? 10 : 1,
    },
    listenerBase: {
      currencyCode: context.listenerBase.currencyCode,
      ratePerMinuteMinor: Number(context.listenerBase.ratePerMinuteMinor),
      callerCountryIndependent: true,
    },
    marketplace: context.marketplace,
    calls: {
      primaryTransport: transport.primary,
      fallbackTransport: transport.fallback,
      internetVoiceRelayConfigured: transport.internetVoice.relayConfigured,
      iranDomesticPathConfigured: transport.internetVoice.iranDomesticPathConfigured,
      sessionCapsMinutes: [10, 30, 60],
      extensionMinutes: [15, 30],
      noAnswerSeconds: 90,
    },
    legal: getPublicReleaseConfig(),
    languages: languages.rows.map((item) => ({ code: item.code, nameFa: item.name_fa, nameEn: item.name_en })),
  });
}
