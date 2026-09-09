import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { HttpError } from '../services/api/src/lib/http.ts';
import {
  createAdminWalletCreditWithDependencies,
  readPositiveAdminCreditAmount,
} from '../services/api/src/routes/admin-payments.ts';
import {
  applyInternalBetaAdminCredit,
  INTERNAL_BETA_ADMIN_CREDIT,
  type InternalBetaAdminCreditInput,
} from '../services/api/src/services/admin-wallet-credit.ts';

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WALLET_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type StoredTransaction = {
  id: string;
  walletId: string;
  targetUserId: string;
  amountMinor: string;
  currencyCode: string;
  balanceAfterMinor: string;
  reason: string;
  operationType: string;
  idempotencyReference: string;
  createdAt: string;
};

class FakeCreditDatabase {
  readonly users = new Set([USER_ID]);
  readonly currencies = new Set(['IRR']);
  readonly wallets = new Map<string, { id: string; balanceMinor: bigint }>();
  readonly transactions: StoredTransaction[] = [];
  readonly audits: Array<Record<string, string>> = [];
  readonly statements: string[] = [];

  async query<T>(sql: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.statements.push(normalized);

    if (normalized.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };

    if (normalized.includes('FROM app.wallet_transactions wt')) {
      const row = this.transactions.find((item) => item.idempotencyReference === values[0]);
      return {
        rows: row ? [{
          transaction_id: row.id,
          wallet_id: row.walletId,
          target_user_id: row.targetUserId,
          delta_minor: row.amountMinor,
          currency_code: row.currencyCode,
          balance_after_minor: row.balanceAfterMinor,
          current_balance_minor: row.balanceAfterMinor,
          reserved_minor: '0',
          reason: row.reason,
          operation_type: row.operationType,
        } as T] : [],
        rowCount: row ? 1 : 0,
      };
    }

    if (normalized.includes('FROM app.users')) {
      const found = this.users.has(String(values[0]));
      return { rows: found ? [{ id: values[0] } as T] : [], rowCount: found ? 1 : 0 };
    }

    if (normalized.startsWith('SELECT code FROM app.currencies')) {
      const found = this.currencies.has(String(values[0]));
      return { rows: found ? [{ code: values[0] } as T] : [], rowCount: found ? 1 : 0 };
    }

    if (normalized.startsWith('INSERT INTO app.wallets')) {
      const key = `${values[0]}:${values[1]}`;
      if (!this.wallets.has(key)) this.wallets.set(key, { id: WALLET_ID, balanceMinor: 0n });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.includes('FROM app.wallets') && normalized.includes('FOR UPDATE')) {
      const wallet = this.wallets.get(`${values[0]}:${values[1]}`);
      return {
        rows: wallet ? [{ id: wallet.id, balance_minor: wallet.balanceMinor.toString(), reserved_minor: '0' } as T] : [],
        rowCount: wallet ? 1 : 0,
      };
    }

    if (normalized.startsWith('UPDATE app.wallets')) {
      const wallet = [...this.wallets.values()].find((item) => item.id === values[0]);
      if (!wallet || wallet.balanceMinor !== BigInt(String(values[2]))) return { rows: [], rowCount: 0 };
      wallet.balanceMinor = BigInt(String(values[1]));
      return { rows: [{ balance_minor: wallet.balanceMinor.toString() } as T], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO app.wallet_transactions')) {
      const id = `dddddddd-dddd-4ddd-8ddd-${String(this.transactions.length + 1).padStart(12, '0')}`;
      const createdAt = '2026-09-09T21:00:00.000Z';
      this.transactions.push({
        id,
        walletId: String(values[0]),
        targetUserId: USER_ID,
        amountMinor: String(values[2]),
        currencyCode: String(values[1]),
        balanceAfterMinor: String(values[3]),
        reason: '',
        operationType: String(values[5]),
        idempotencyReference: String(values[6]),
        createdAt,
      });
      return { rows: [{ id, created_at: createdAt } as T], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO app.audit_logs')) {
      const transaction = this.transactions.find((item) => item.id === values[2]);
      if (!transaction) throw new Error('audit_without_transaction');
      transaction.reason = String(values[7]);
      this.audits.push({
        adminActorUserId: String(values[0]),
        action: String(values[1]),
        transactionId: String(values[2]),
        adminRole: String(values[3]),
        targetUserId: String(values[4]),
        amountMinor: String(values[5]),
        currencyCode: String(values[6]),
        reason: String(values[7]),
        operationTimestamp: String(values[8]),
        idempotencyReference: String(values[9]),
      });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in fake credit database: ${normalized}`);
  }
}

function input(overrides: Partial<InternalBetaAdminCreditInput> = {}): InternalBetaAdminCreditInput {
  return {
    adminUserId: ADMIN_ID,
    adminRole: 'owner',
    targetUserId: USER_ID,
    amountMinor: 40_000n,
    currencyCode: 'IRR',
    reason: 'اعتبار تست تماس بتای داخلی',
    idempotencyKey: 'beta-credit-0001',
    ...overrides,
  };
}

function expectHttpError(status: number, code: string) {
  return (error: unknown) => error instanceof HttpError && error.status === status && error.code === code;
}

test('unauthenticated and non-admin requests are rejected before any transaction', async () => {
  for (const rejection of [new HttpError(401, 'unauthorized'), new HttpError(403, 'admin_required')]) {
    let transactionStarted = false;
    await assert.rejects(
      createAdminWalletCreditWithDependencies({} as IncomingMessage, {} as ServerResponse, {
        authenticate: async () => { throw rejection; },
        transact: async () => { transactionStarted = true; throw new Error('unexpected_transaction'); },
      }),
      expectHttpError(rejection.status, rejection.code),
    );
    assert.equal(transactionStarted, false);
  }
});

test('zero and negative credit amounts are rejected', () => {
  assert.throws(() => readPositiveAdminCreditAmount(0), expectHttpError(400, 'invalid_amount'));
  assert.throws(() => readPositiveAdminCreditAmount('-1'), expectHttpError(400, 'invalid_amount'));
});

test('an invalid target user is rejected without creating ledger or audit rows', async () => {
  const db = new FakeCreditDatabase();
  await assert.rejects(
    applyInternalBetaAdminCredit(db as never, input({ targetUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' })),
    expectHttpError(404, 'target_user_not_found'),
  );
  assert.equal(db.transactions.length, 0);
  assert.equal(db.audits.length, 0);
});

test('successful admin credit creates one ledger row, updates balance and writes the full audit', async () => {
  const db = new FakeCreditDatabase();
  const result = await applyInternalBetaAdminCredit(db as never, input());

  assert.equal(result.idempotent, false);
  assert.equal(result.operationType, INTERNAL_BETA_ADMIN_CREDIT);
  assert.equal(result.balanceMinor, '40000');
  assert.equal(result.availableMinor, '40000');
  assert.equal(db.wallets.get(`${USER_ID}:IRR`)?.balanceMinor, 40_000n);
  assert.equal(db.transactions.length, 1);
  assert.equal(db.audits.length, 1);
  assert.deepEqual(db.audits[0], {
    adminActorUserId: ADMIN_ID,
    action: INTERNAL_BETA_ADMIN_CREDIT,
    transactionId: result.transactionId,
    adminRole: 'owner',
    targetUserId: USER_ID,
    amountMinor: '40000',
    currencyCode: 'IRR',
    reason: 'اعتبار تست تماس بتای داخلی',
    operationTimestamp: '2026-09-09T21:00:00.000Z',
    idempotencyReference: result.idempotencyReference,
  });
  assert.equal(db.statements.some((sql) => sql.includes('payment_attempts')), false);
  assert.equal(db.statements.some((sql) => /verifyPayment|payment_provider/i.test(sql)), false);
});

test('same idempotency key cannot double-credit and a different key can credit again', async () => {
  const db = new FakeCreditDatabase();
  const first = await applyInternalBetaAdminCredit(db as never, input());
  const repeated = await applyInternalBetaAdminCredit(db as never, input());

  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.transactionId, first.transactionId);
  assert.equal(db.transactions.length, 1);
  assert.equal(db.audits.length, 1);
  assert.equal(db.wallets.get(`${USER_ID}:IRR`)?.balanceMinor, 40_000n);

  const separate = await applyInternalBetaAdminCredit(db as never, input({ idempotencyKey: 'beta-credit-0002' }));
  assert.equal(separate.idempotent, false);
  assert.equal(db.transactions.length, 2);
  assert.equal(db.audits.length, 2);
  assert.equal(db.wallets.get(`${USER_ID}:IRR`)?.balanceMinor, 80_000n);
});

test('required human-readable reason is enforced by the admin route', async () => {
  const body = Buffer.from(JSON.stringify({
    targetUserId: USER_ID,
    amountMinor: '40000',
    currencyCode: 'IRR',
    idempotencyKey: 'beta-credit-0003',
  }));
  const req = {
    async *[Symbol.asyncIterator]() { yield body; },
  } as unknown as IncomingMessage;
  let transactionStarted = false;
  await assert.rejects(
    createAdminWalletCreditWithDependencies(req, {} as ServerResponse, {
      authenticate: async () => ({ userId: ADMIN_ID, adminRole: 'owner' }),
      transact: async () => { transactionStarted = true; throw new Error('unexpected_transaction'); },
    }),
    expectHttpError(400, 'invalid_field'),
  );
  assert.equal(transactionStarted, false);
});

test('admin credit is routed only under admin and public payment remains closed-gated', async () => {
  const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /POST' && url\.pathname === '\/v1\/admin\/wallet-credits'/);
  assert.match(handler, /POST' && url\.pathname === '\/v1\/wallet\/topups'\) \{ requireCallerClosedBetaEnabled\(\)/);
  assert.doesNotMatch(handler, /\/v1\/wallet\/credits/);
});

test('Admin UI requires target, amount, currency, reason and a one-use idempotency key', async () => {
  const page = await readFile(new URL('../apps/admin/app/payments/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /targetUserId/);
  assert.match(page, /amountMinor/);
  assert.match(page, /currencyCode/);
  assert.match(page, /reason/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /\/api\/ops\/wallet-credits/);
  assert.match(page, /disabled=\{creditBusy \|\| Boolean\(creditResult\)/);
});
