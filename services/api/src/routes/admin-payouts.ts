import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAdmin } from '../lib/admin.ts';
import { HttpError, readJson, requireString, sendJson } from '../lib/http.ts';

const ALLOWED_STATUSES = new Set(['created', 'processing', 'failed', 'paid']);
const AMBIGUOUS_DISPATCH_MINUTES = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANDIDATE_VERSION_RE = /^[0-9a-f]{64}$/i;

type PayoutConsistencyRow = {
  amount_minor: string;
  source_count: string;
  source_total_minor: string;
  earning_market_mismatch_count: string;
  source_state_mismatch_count: string;
  provider_state_mismatch: boolean;
  paid_at_mismatch: boolean;
};

function limitFrom(value: string | null): number {
  if (!value) return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new HttpError(400, 'invalid_limit');
  return parsed;
}

function uuidFrom(value: unknown, field: string): string {
  const id = requireString(value, field, 36, 36);
  if (!UUID_RE.test(id)) throw new HttpError(400, `invalid_${field}`);
  return id;
}

function currencyFrom(value: unknown): string {
  const currency = requireString(value, 'currencyCode', 3, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'invalid_currency');
  return currency;
}

function positiveMinorFrom(value: unknown): bigint {
  const raw = requireString(value, 'expectedAvailableMinor', 1, 30);
  if (!/^\d+$/.test(raw)) throw new HttpError(400, 'invalid_expected_amount');
  const amount = BigInt(raw);
  if (amount <= 0n) throw new HttpError(400, 'invalid_expected_amount');
  return amount;
}

function positiveCountFrom(value: unknown): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 100_000) {
    throw new HttpError(400, 'invalid_expected_earning_count');
  }
  return count;
}

function candidateVersionFor(
  listenerUserId: string,
  marketId: string,
  currencyCode: string,
  sources: string[],
): string {
  return createHash('sha256')
    .update([listenerUserId, marketId, currencyCode, ...sources].join('\n'))
    .digest('hex');
}

function consistencyIssuesFor(row: PayoutConsistencyRow): string[] {
  const issues: string[] = [];
  if (Number(row.source_count) < 1) issues.push('no_sources');
  if (BigInt(row.source_total_minor) !== BigInt(row.amount_minor)) issues.push('source_total_mismatch');
  if (Number(row.earning_market_mismatch_count) > 0) issues.push('earning_market_mismatch');
  if (Number(row.source_state_mismatch_count) > 0) issues.push('source_state_mismatch');
  if (row.provider_state_mismatch) issues.push('provider_state_mismatch');
  if (row.paid_at_mismatch) issues.push('paid_at_mismatch');
  return issues;
}

export async function listAdminPayouts(req: IncomingMessage, res: ServerResponse) {
  await requireAdmin(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const status = url.searchParams.get('status')?.trim() || null;
  if (status && !ALLOWED_STATUSES.has(status)) throw new HttpError(400, 'invalid_payout_status');
  const limit = limitFrom(url.searchParams.get('limit'));

  const [result, candidates, pendingBacklog] = await Promise.all([
    query<{
      id: string;
      listener_user_id: string;
      amount_minor: string;
      currency_code: string;
      status: string;
      provider: string | null;
      dispatch_needs_reconciliation: boolean;
      created_at: string;
      updated_at: string;
      paid_at: string | null;
      source_count: string;
      source_total_minor: string;
      earning_market_mismatch_count: string;
      source_state_mismatch_count: string;
      provider_state_mismatch: boolean;
      paid_at_mismatch: boolean;
      kyc_status: string | null;
    }>(`
      SELECT p.id::text,
             p.listener_user_id::text,
             p.amount_minor::text,
             p.currency_code,
             p.status::text,
             p.provider,
             (
               p.status::text='processing'
               AND p.provider IS NOT NULL
               AND p.provider_reference IS NULL
               AND p.updated_at < now() - ($3::int * interval '1 minute')
             ) AS dispatch_needs_reconciliation,
             p.created_at::text,
             p.updated_at::text,
             p.paid_at::text,
             COUNT(pi.id)::text AS source_count,
             COALESCE(SUM(pi.amount_minor),0)::text AS source_total_minor,
             COUNT(*) FILTER (
               WHERE pi.earning_id IS NOT NULL
                 AND e.market_id IS DISTINCT FROM p.market_id
             )::text AS earning_market_mismatch_count,
             COUNT(*) FILTER (
               WHERE
                 (
                   pi.earning_id IS NOT NULL
                   AND (
                     (p.status::text='paid' AND e.status::text<>'paid')
                     OR (p.status::text IN ('created','processing','failed') AND e.status::text<>'available')
                   )
                 )
                 OR
                 (
                   pi.guarantee_assignment_id IS NOT NULL
                   AND (
                     (p.status::text='paid' AND g.status::text<>'settled')
                     OR (p.status::text IN ('created','processing','failed') AND g.status::text<>'eligible')
                   )
                 )
             )::text AS source_state_mismatch_count,
             (
               (p.status::text='created' AND (p.provider IS NOT NULL OR p.provider_reference IS NOT NULL))
               OR (p.status::text IN ('processing','failed','paid') AND p.provider IS NULL)
             ) AS provider_state_mismatch,
             (
               (p.status::text='paid' AND p.paid_at IS NULL)
               OR (p.status::text<>'paid' AND p.paid_at IS NOT NULL)
             ) AS paid_at_mismatch,
             k.status::text AS kyc_status
      FROM app.payouts p
      LEFT JOIN app.payout_items pi ON pi.payout_id=p.id
      LEFT JOIN app.listener_earnings e ON e.id=pi.earning_id
      LEFT JOIN app.listener_guarantee_assignments g ON g.id=pi.guarantee_assignment_id
      LEFT JOIN private_data.listener_kyc k ON k.user_id=p.listener_user_id
      WHERE ($1::text IS NULL OR p.status::text=$1)
      GROUP BY p.id, k.status
      ORDER BY
        CASE p.status::text
          WHEN 'created' THEN 0
          WHEN 'processing' THEN 1
          WHEN 'failed' THEN 2
          ELSE 3
        END,
        p.created_at ASC
      LIMIT $2
    `, [status, limit, AMBIGUOUS_DISPATCH_MINUTES]),
    query<{
      listener_user_id: string;
      market_id: string;
      currency_code: string;
      available_minor: string;
      earning_count: string;
      oldest_available_at: string;
      kyc_status: string | null;
      earning_sources: string[];
    }>(`
      SELECT e.listener_user_id::text,
             e.market_id::text,
             e.currency_code,
             COALESCE(SUM(e.amount_minor),0)::text AS available_minor,
             COUNT(*)::text AS earning_count,
             MIN(e.created_at)::text AS oldest_available_at,
             k.status::text AS kyc_status,
             ARRAY_AGG(e.id::text || ':' || e.amount_minor::text ORDER BY e.id::text) AS earning_sources
      FROM app.listener_earnings e
      LEFT JOIN app.payout_items pi ON pi.earning_id=e.id
      LEFT JOIN private_data.listener_kyc k ON k.user_id=e.listener_user_id
      WHERE e.status='available' AND pi.id IS NULL
      GROUP BY e.listener_user_id, e.market_id, e.currency_code, k.status
      ORDER BY MIN(e.created_at) ASC
      LIMIT 100
    `),
    query<{
      currency_code: string;
      pending_minor: string;
      earning_count: string;
      listener_count: string;
      oldest_pending_at: string | null;
    }>(`
      SELECT e.currency_code,
             COALESCE(SUM(e.amount_minor),0)::text AS pending_minor,
             COUNT(*)::text AS earning_count,
             COUNT(DISTINCT e.listener_user_id)::text AS listener_count,
             MIN(e.created_at)::text AS oldest_pending_at
      FROM app.listener_earnings e
      WHERE e.status='pending'
      GROUP BY e.currency_code
      ORDER BY e.currency_code
    `),
  ]);

  const payouts = result.rows.map((row) => ({
    id: row.id,
    listenerUserId: row.listener_user_id,
    amountMinor: row.amount_minor,
    currencyCode: row.currency_code,
    status: row.status,
    provider: row.provider,
    dispatchNeedsReconciliation: row.dispatch_needs_reconciliation,
    sourceCount: Number(row.source_count),
    kycStatus: row.kyc_status ?? 'not_started',
    consistencyIssues: consistencyIssuesFor(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
  }));

  sendJson(res, 200, {
    thresholds: { ambiguousDispatchMinutes: AMBIGUOUS_DISPATCH_MINUTES },
    payouts,
    listedConsistency: {
      payoutCount: payouts.length,
      payoutsWithIssues: payouts.filter((row) => row.consistencyIssues.length > 0).length,
      issueCount: payouts.reduce((sum, row) => sum + row.consistencyIssues.length, 0),
    },
    payoutCandidates: candidates.rows.map((row) => ({
      listenerUserId: row.listener_user_id,
      marketId: row.market_id,
      currencyCode: row.currency_code,
      availableMinor: row.available_minor,
      earningCount: Number(row.earning_count),
      oldestAvailableAt: row.oldest_available_at,
      kycStatus: row.kyc_status ?? 'not_started',
      candidateVersion: candidateVersionFor(
        row.listener_user_id,
        row.market_id,
        row.currency_code,
        row.earning_sources,
      ),
    })),
    pendingEarningBacklog: pendingBacklog.rows.map((row) => ({
      currencyCode: row.currency_code,
      pendingMinor: row.pending_minor,
      earningCount: Number(row.earning_count),
      listenerCount: Number(row.listener_count),
      oldestPendingAt: row.oldest_pending_at,
    })),
    consistencyDiagnosticsReadOnly: true,
    providerReferencesIncluded: false,
    bankDetailsIncluded: false,
  });
}

export async function prepareAdminPayout(req: IncomingMessage, res: ServerResponse) {
  const admin = await requireAdmin(req);
  const body = await readJson<{
    listenerUserId?: unknown;
    marketId?: unknown;
    currencyCode?: unknown;
    expectedAvailableMinor?: unknown;
    expectedEarningCount?: unknown;
    candidateVersion?: unknown;
  }>(req);

  const listenerUserId = uuidFrom(body.listenerUserId, 'listener');
  const marketId = uuidFrom(body.marketId, 'market');
  const currencyCode = currencyFrom(body.currencyCode);
  const expectedAvailableMinor = positiveMinorFrom(body.expectedAvailableMinor);
  const expectedEarningCount = positiveCountFrom(body.expectedEarningCount);
  const candidateVersion = requireString(body.candidateVersion, 'candidateVersion', 64, 64).toLowerCase();
  if (!CANDIDATE_VERSION_RE.test(candidateVersion)) throw new HttpError(400, 'invalid_candidate_version');

  const prepared = await withTransaction(async (client) => {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`yeki_hast:payout_prepare:${listenerUserId}:${marketId}:${currencyCode}`],
    );

    const prior = await client.query<{
      id: string;
      status: string;
      amount_minor: string;
      total_source_count: string;
      earning_source_count: string;
      earning_sources: string[] | null;
    }>(`
      SELECT p.id::text,
             p.status::text,
             p.amount_minor::text,
             COUNT(pi.id)::text AS total_source_count,
             COUNT(pi.earning_id)::text AS earning_source_count,
             ARRAY_AGG(pi.earning_id::text || ':' || pi.amount_minor::text ORDER BY pi.earning_id::text)
               FILTER (WHERE pi.earning_id IS NOT NULL) AS earning_sources
      FROM app.payouts p
      JOIN app.payout_items pi ON pi.payout_id=p.id
      WHERE p.listener_user_id=$1
        AND p.market_id=$2
        AND p.currency_code=$3
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [listenerUserId, marketId, currencyCode]);

    for (const row of prior.rows) {
      const sources = row.earning_sources ?? [];
      if (Number(row.total_source_count) !== Number(row.earning_source_count)) continue;
      if (Number(row.earning_source_count) !== expectedEarningCount) continue;
      if (BigInt(row.amount_minor) !== expectedAvailableMinor) continue;
      if (candidateVersionFor(listenerUserId, marketId, currencyCode, sources) !== candidateVersion) continue;
      return {
        payoutId: row.id,
        status: row.status,
        amountMinor: row.amount_minor,
        currencyCode,
        sourceCount: Number(row.earning_source_count),
        idempotent: true,
      };
    }

    const earnings = await client.query<{
      id: string;
      amount_minor: string;
    }>(`
      SELECT e.id::text, e.amount_minor::text
      FROM app.listener_earnings e
      LEFT JOIN app.payout_items pi ON pi.earning_id=e.id
      WHERE e.listener_user_id=$1
        AND e.market_id=$2
        AND e.currency_code=$3
        AND e.status='available'
        AND pi.id IS NULL
      ORDER BY e.created_at ASC, e.id ASC
      FOR UPDATE OF e
    `, [listenerUserId, marketId, currencyCode]);

    if (!earnings.rowCount) throw new HttpError(409, 'payout_candidate_not_found');

    const sourceStrings = earnings.rows
      .map((row) => `${row.id}:${row.amount_minor}`)
      .sort();
    const actualVersion = candidateVersionFor(listenerUserId, marketId, currencyCode, sourceStrings);
    const actualAmountMinor = earnings.rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);

    if (
      actualVersion !== candidateVersion
      || earnings.rows.length !== expectedEarningCount
      || actualAmountMinor !== expectedAvailableMinor
    ) {
      throw new HttpError(409, 'payout_candidate_changed');
    }

    const payoutId = randomUUID();
    await client.query(`
      INSERT INTO app.payouts(id, listener_user_id, market_id, currency_code, amount_minor, status)
      VALUES ($1,$2,$3,$4,$5,'created')
    `, [payoutId, listenerUserId, marketId, currencyCode, actualAmountMinor.toString()]);

    const itemIds = earnings.rows.map(() => randomUUID());
    const earningIds = earnings.rows.map((row) => row.id);
    const attached = await client.query(`
      INSERT INTO app.payout_items(id, payout_id, listener_user_id, currency_code, earning_id, amount_minor)
      SELECT source.item_id,
             $1,
             e.listener_user_id,
             e.currency_code,
             e.id,
             e.amount_minor
      FROM UNNEST($2::uuid[], $3::uuid[]) AS source(item_id, earning_id)
      JOIN app.listener_earnings e ON e.id=source.earning_id
    `, [payoutId, itemIds, earningIds]);
    if (attached.rowCount !== earnings.rows.length) throw new HttpError(409, 'payout_source_attach_conflict');

    await client.query(`
      INSERT INTO app.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1,'payout_prepared','payout',$2,
              jsonb_build_object(
                'listenerUserId',$3,
                'marketId',$4,
                'currencyCode',$5,
                'amountMinor',$6,
                'sourceCount',$7,
                'candidateVersion',$8
              ))
    `, [
      admin.userId,
      payoutId,
      listenerUserId,
      marketId,
      currencyCode,
      actualAmountMinor.toString(),
      earnings.rows.length,
      candidateVersion,
    ]);

    return {
      payoutId,
      status: 'created',
      amountMinor: actualAmountMinor.toString(),
      currencyCode,
      sourceCount: earnings.rows.length,
      idempotent: false,
    };
  });

  sendJson(res, prepared.idempotent ? 200 : 201, {
    ok: true,
    ...prepared,
    providerCallIncluded: false,
    pendingEarningsTouched: false,
    bankDetailsIncluded: false,
  });
}
