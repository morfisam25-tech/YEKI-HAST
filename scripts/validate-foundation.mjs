import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../packages/db/migrations/0001_initial.sql', import.meta.url), 'utf8');
const config = await readFile(new URL('../packages/config/src/index.ts', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const server = await readFile(new URL('../services/api/src/server.ts', import.meta.url), 'utf8');
const handler = await readFile(new URL('../services/api/src/handler.ts', import.meta.url), 'utf8');
const authRoute = await readFile(new URL('../services/api/src/routes/auth.ts', import.meta.url), 'utf8');
const authLib = await readFile(new URL('../services/api/src/lib/auth.ts', import.meta.url), 'utf8');
const security = await readFile(new URL('../services/api/src/lib/security.ts', import.meta.url), 'utf8');
const listenerRoute = await readFile(new URL('../services/api/src/routes/listener.ts', import.meta.url), 'utf8');
const billing = await readFile(new URL('../packages/domain/src/billing.ts', import.meta.url), 'utf8');
const dbClient = await readFile(new URL('../packages/db/src/client.ts', import.meta.url), 'utf8');

const checks = [
  ['no IRR-hardcoded money column suffixes', !/_irr\b/.test(sql)],
  ['migration transaction owned by runner', !/^BEGIN;|^COMMIT;/m.test(sql)],
  ['pgcrypto extension not required', !/CREATE EXTENSION.*pgcrypto/i.test(sql)],
  ['waitlist product scoped', sql.includes('UNIQUE (user_id, product_id)')],
  ['presence market/product/service scoped', sql.includes('PRIMARY KEY (listener_user_id, product_id, service_id, market_id)')],
  ['presence updated_at trigger', sql.includes('CREATE TRIGGER listener_presence_set_updated_at')],
  ['final brand seed', sql.includes("VALUES ('yeki_hast', 'یکی هست', 'private_beta')")],
  ['human listening only seeded', sql.includes("VALUES ('human_listening', 'active')") && !sql.includes("VALUES ('language_conversation'")],
  ['caller beta rate 31,000 IRR/min', sql.includes('31000, 21000, 1')],
  ['global markets table', sql.includes('CREATE TABLE app.markets')],
  ['service-specific listener profile', sql.includes('CREATE TABLE app.listener_service_profiles')],
  ['caller age assertion', sql.includes('CREATE TABLE app.caller_age_assertions')],
  ['auth session hashes', sql.includes('CREATE TABLE private_data.auth_sessions')],
  ['launch guarantee separated', sql.includes('CREATE TABLE app.listener_guarantee_programs')],
  ['subsidy payout source supported', sql.includes('guarantee_assignment_id uuid UNIQUE') && sql.includes("CHECK ((earning_id IS NULL) <> (guarantee_assignment_id IS NULL))")],
  ['wallet has reserved balance', sql.includes('reserved_minor bigint NOT NULL DEFAULT 0') && sql.includes('CHECK (reserved_minor <= balance_minor)')],
  ['call has authorization cap', sql.includes('authorized_minor bigint NOT NULL DEFAULT 0') && sql.includes('max_billable_seconds integer')],
  ['transactional tables carry market', ['app.call_sessions','app.reservations','app.listener_earnings','app.payment_attempts','app.payouts'].every((table) => {
    const start = sql.indexOf(`CREATE TABLE ${table}`); const end = sql.indexOf(');', start); return start >= 0 && sql.slice(start, end).includes('market_id uuid NOT NULL');
  })],
  ['wallet transaction currency is explicit', /CREATE TABLE app\.wallet_transactions[\s\S]*?currency_code char\(3\) NOT NULL/.test(sql)],
  ['composite wallet currency FK', sql.includes('FOREIGN KEY (wallet_id, currency_code) REFERENCES app.wallets(id, currency_code)')],
  ['call billing precondition checks', sql.includes('CHECK (billable_seconds = 0 OR billing_started_at IS NOT NULL)') && sql.includes('CHECK (billing_started_at IS NULL OR connected_at IS NOT NULL)')],
  ['call dial idempotency', sql.includes('UNIQUE (caller_user_id, client_request_id)')],
  ['provider leg dedupe', sql.includes('CREATE UNIQUE INDEX telephony_legs_provider_leg_uidx')],
  ['provider nonzero cost requires currency', sql.includes('CHECK (provider_cost_minor = 0 OR provider_currency_code IS NOT NULL)')],
  ['route handlers awaited', handler.includes("return await requestOtp(req, res)") && handler.includes("return await createListenerApplication(req, res)")],
  ['API errors do not expose message text', !handler.includes('message: error.message')],
  ['wrong OTP commits attempt increment path', authRoute.includes('SET attempt_count=attempt_count+1') && authRoute.includes("return { kind: 'invalid' }")],
  ['OTP request invalidates prior live challenge', authRoute.includes('SET consumed_at=now()') && authRoute.includes('request_ip_hash')],
  ['OTP has IP and global request limits', authRoute.includes('OTP_IP_LIMIT_PER_15M') && authRoute.includes('OTP_GLOBAL_LIMIT_PER_15M')],
  ['OTP request rate-limit section is concurrency serialized', authRoute.includes("pg_advisory_xact_lock(hashtextextended('yeki_hast:otp_request_rate_limit', 0))")],
  ['all stored money values use bigint', !/(?:balance|reserved|authorized|amount|charge|earning|spread|cost|rate)[a-z_]*_minor\s+(?:integer|int|smallint)\b/i.test(sql)],
  ['optional payout source FKs are safe under MATCH SIMPLE', /currency_code char\(3\) NOT NULL/.test(sql) && sql.includes("CHECK ((earning_id IS NULL) <> (guarantee_assignment_id IS NULL))") && !/FOREIGN KEY \(earning_id, currency_code\)[^;\n]*MATCH FULL/i.test(sql)],
  ['DEV OTP fails closed', authRoute.includes("process.env.NODE_ENV === 'development'")],
  ['auth rejects suspended users', authLib.includes("u.status='active'")],
  ['listener terminal applications locked', listenerRoute.includes("WHERE existing.status IN ('exploring','training','assessment')")],
  ['AES-GCM uses AAD', security.includes('cipher.setAAD') && security.includes('decipher.setAAD')],
  ['encryption payload carries key id', security.includes('ACTIVE_DATA_ENCRYPTION_KEY_ID') && security.includes('DATA_ENCRYPTION_KEYS')],
  ['billing consumes increment', billing.includes('billingIncrementSeconds') && billing.includes('roundBillableSeconds')],
  ['caller/listener rounding policy explicit', billing.includes("rounding === 'caller' ? Math.ceil(raw) : Math.floor(raw)")],
  ['payout binds listener+currency to payout', sql.includes('FOREIGN KEY (payout_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.payouts(id, listener_user_id, currency_code)')],
  ['payout earning source binds listener+currency', sql.includes('FOREIGN KEY (earning_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.listener_earnings(id, listener_user_id, currency_code)')],
  ['payout guarantee source binds listener+currency', sql.includes('FOREIGN KEY (guarantee_assignment_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.listener_guarantee_assignments(id, listener_user_id, currency_code)')],
  ['earning listener must match call listener', sql.includes('FOREIGN KEY (call_session_id, listener_user_id, currency_code)') && sql.includes('REFERENCES app.call_sessions(id, listener_user_id, currency_code)')],
  ['billable seconds cannot exceed authorization cap', sql.includes('CHECK (max_billable_seconds IS NULL OR billable_seconds <= max_billable_seconds)')],
  ['payout items immutable after processing starts', sql.includes('CREATE TRIGGER payout_items_guard_mutation') && sql.includes("target_status <> 'created'")],
  ['payout total validated before processing', sql.includes('CREATE TRIGGER payouts_validate_total_before_processing') && sql.includes('BEFORE INSERT OR UPDATE OF status, amount_minor ON app.payouts') && sql.includes('payout_amount_mismatch')],
  ['payout cannot revert to created after processing starts', sql.includes('CREATE TRIGGER payouts_guard_status_transition') && sql.includes("OLD.status <> 'created' AND NEW.status = 'created'") && sql.includes('payout_status_cannot_revert_to_created')],
  ['paid and cancelled payouts are terminal', sql.includes("OLD.status IN ('paid', 'cancelled')") && sql.includes('payout_status_terminal')],
  ['payout item guard preserves ON DELETE CASCADE', sql.includes("IF target_status IS NULL THEN") && sql.includes("IF TG_OP = 'DELETE' THEN") && sql.includes('RETURN OLD;')],
  ['remote DB forces verify-full TLS', dbClient.includes("url.searchParams.set('sslmode', 'verify-full')") && !dbClient.includes('rejectUnauthorized: false')],
  ['encryption key ids cannot contain delimiter', security.includes('keyIdPattern') && security.includes('/^[A-Za-z0-9_-]{1,64}$/')],
  ['config language mode disabled', config.includes('languageConversationEnabled: false')],
  ['README final name', readme.startsWith('# یکی هست')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) process.exitCode = 1;
