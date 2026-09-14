# W57 — Safe Internal Beta Preview Implementation

## Status

PASS — see [Success criteria](#success-criteria) at the end of this document.

## Exact base

- Base branch: `w55/final-rc-clean-qa-20260914`
- Base SHA (verified against `origin/w55/final-rc-clean-qa-20260914`): `88c6d8ade29da304688c932d77ffc6e6d1bd20fc`
- W57 branch: `w57/safe-internal-beta-preview-20260914`
- Final SHA: `ed0758615ea4e51b94c5dea933e576f447fcc7a1`

## What W56 actually found, verified against source

The W56 finding was reproduced exactly: `apps/web/app/api/_backend.ts` and
`apps/admin/app/api/_backend.ts` both decided the backend API origin with

```ts
if (process.env.NODE_ENV === 'production') return PRODUCTION_API_BASE_URL;
```

`NODE_ENV` is not a safe signal for this. Vercel builds **Production and Preview**
deployments with `NODE_ENV=production` (this is a platform-wide default, not specific to
Next.js) — so before this change, any real Preview deployment of `apps/web` or
`apps/admin` would have silently proxied every server-side API call to the real
Production API (`https://yeki-hast-unique-6ff0.vercel.app`), sharing Production's
database, wallets, and providers. This is the exact risk class the historical W14 design
was quarantined for in W25 (see [W14/W25](#w14w25-historical-quarantine-preserved)).

## 1. Environment identity

New files: [`apps/web/app/api/_env.ts`](../apps/web/app/api/_env.ts),
[`apps/admin/app/api/_env.ts`](../apps/admin/app/api/_env.ts) (identical, kept per-app
because these two Next.js apps intentionally have zero workspace dependencies today —
see [Design notes](#design-notes)).

```ts
export type AppEnv = 'production' | 'preview_internal_beta' | 'local';

export function resolveAppEnv(): AppEnv {
  const explicit = process.env.APP_ENV?.trim().toLowerCase();
  if (explicit) {
    if (KNOWN_APP_ENVS.includes(explicit)) return explicit as AppEnv;
    throw new Error(`APP_ENV has an unrecognized value: "${explicit}" ...`); // fails closed
  }
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview_internal_beta';
  return 'local';
}
```

Resolution order and why it's safe:

1. **Explicit `APP_ENV`** — an override for cases where the platform signal is absent
   (local scripts) or must be pinned. An unrecognized non-empty value **throws** — it is
   never silently treated as safe. `APP_ENV` is optional; nothing in Production needs it
   set, so no Vercel dashboard change is required for Production to keep working.
2. **Platform-provided `VERCEL_ENV`** — `production` / `preview` / `development`. Unlike
   `NODE_ENV`, Vercel sets this correctly and distinctly for every deployment type, and it
   is already the exact signal `services/api/src/lib/internal-owner-test.ts` (W25) relies
   on for the same reason. Using it here makes `_backend.ts` consistent with that
   already-audited pattern instead of inventing a second one.
3. **`local`** — the fallback when neither is set (local dev, `node --test`). The `local`
   branch of `backendBaseUrl()` never defaults to Production; at worst it points at
   `localhost:4000`, which fails loudly instead of silently reaching Production.

`NODE_ENV` is not read by `resolveAppEnv()` at all.

## 2 & 3. Web/Admin backend routing fix

Both `backendBaseUrl()` functions now branch on `resolveAppEnv()`:

- `production` → unconditionally `PRODUCTION_API_BASE_URL` (unchanged canonical origin,
  unchanged behavior for real Production — same as before, since real Production always
  has `VERCEL_ENV=production`).
- `preview_internal_beta` → **requires** `WEB_API_BASE_URL` / `ADMIN_API_BASE_URL` to be
  set to a distinct origin. Missing → throws (`WEB_API_BASE_URL is required in
  preview_internal_beta...`, fails closed, 500 instead of silently reaching Production).
  Configured to the Production origin (by hostname, so a trailing slash or protocol
  mismatch can't bypass it) → throws (`must not point at the Production API origin in
  preview_internal_beta`).
- `local` → unchanged (`WEB_API_BASE_URL`/`ADMIN_API_BASE_URL` override, else
  `localhost:4000`).

Regression tests: [`tests/preview-backend-routing-guard.test.ts`](../tests/preview-backend-routing-guard.test.ts) —
proves, for both apps:
- Preview + missing Preview API URL fails closed and is never equal to the Production origin.
- Preview + the Production API URL supplied is rejected (both with and without a trailing slash).
- Preview + a valid, distinct Preview API URL is accepted and used verbatim.
- Production always resolves the canonical origin even if an attacker-controlled override is present.
- `local` never reaches Production.
- `resolveAppEnv()` derives correctly from `VERCEL_ENV` and fails closed on an unrecognized `APP_ENV`.

Existing tests `tests/browser-proxy-production-target.test.ts` and
`tests/web-admin-api-origin.test.ts` asserted the literal old `NODE_ENV === 'production'`
source string; they were updated to assert the new `resolveAppEnv()`-based ordering and to
assert the old unsafe line is now absent. `tests/deployment-api-base-guard.test.ts`,
`tests/production-origin-guard.test.ts` and `tests/vercel-runtime-routing.test.ts` needed
no changes (they check the canonical/stale origin strings and `vercel.json`/`api/runtime.ts`
wiring, none of which changed).

`browserMutationAllowed()` (CSRF/mutation guard) was **not** changed: it already fails
closed correctly today because Preview's `NODE_ENV` happens to be `production`, and
`tests/browser-mutation-origin-guard.test.ts` pins that behavior by toggling `NODE_ENV`
directly. Changing its identity check would have been a second unrelated risk surface for
no security benefit, so it was left alone (see [Design notes](#design-notes)).

## 4. Database isolation guard — already existed (W25), verified, not rebuilt

`services/api/src/lib/internal-owner-test.ts` (`requireDedicatedInternalBetaDatabase()`)
already implements exactly what W57 item 3 asks for, predating this branch:

- Requires a **dedicated** `INTERNAL_BETA_DATABASE_URL`.
- Refuses to start if its identity (protocol+host+port+path) equals `PRODUCTION_DATABASE_URL`.
- Refuses to start if it equals the ambient `DATABASE_URL` (unless that URL is `localhost`,
  so local dev with one local Postgres instance still works).
- `isInternalOwnerTestMode()` unconditionally returns `false` whenever `VERCEL_ENV=production`,
  **before** any of the above checks run — so no combination of the other env vars can turn
  it on in real Production. One bad env var is never enough by itself.

This is proven by the pre-existing `tests/internal-owner-test-mode.test.ts` (8 tests,
unchanged, still passing). No new DB-isolation code was written for W57; it was verified
against the checklist and reused.

## 5. Owner Internal Beta mode & 6. Test listener state — already existed (W25), verified

- Fixed synthetic UUIDs `INTERNAL_OWNER_TEST_LISTENER_ID` / `INTERNAL_OWNER_TEST_CALLER_ID`
  (`services/api/src/lib/internal-owner-test.ts`) — never user-supplied, so there is no
  generic impersonation endpoint and no arbitrary `user_id` impersonation.
- `services/api/src/routes/internal-owner-test.ts` `bootstrapOwnerTest()` provisions those
  two identities directly (real `app.users`/`app.listener_profiles`/`app.wallets` rows,
  tagged `'[INTERNAL TEST DATA]'` in every user-visible field) and mints real session
  tokens for them by inserting directly into `private_data.auth_sessions` — it does **not**
  touch `private_data.listener_kyc`, does **not** set `is_verified=true`
  (`is_verified=false` is written explicitly), and does not claim Shahkar/bank
  verification anywhere. `tests/internal-owner-test-mode.test.ts` asserts the source
  `doesNotMatch(/listener_kyc/)` and that the exact `is_verified=false` values are used.
- The synthetic listener is only visible in the marketplace / callable at all because
  `marketplace.ts` and `caller-call-request.ts` explicitly check
  `isInternalOwnerTestCaller(userId)` / the fixed listener UUID — real listeners still go
  through the full KYC/verification gate; nothing was weakened for them.
- Authorization to even reach these routes requires
  `x-internal-beta-owner-test-token` matching `INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN`
  (≥32 chars, `timingSafeEqual`), on top of `isInternalOwnerTestMode()` already being true.

No source changes were made to this subsystem for W57 — it already satisfied the
checklist. It was read in full and cross-checked against `tests/internal-owner-test-mode.test.ts`
(12 tests, unchanged, still passing).

## 7. Test wallet — already existed (W25), verified, uses the real billing engine

`bootstrapOwnerTest()` credits the synthetic caller's **real** `app.wallets` row to
`TEST_CREDIT_MINOR = 1_000_000_000n` minor units via a normal `wallet_transactions` ledger
row (`type='manual_credit', reason_code='internal_owner_test'`) and an `app.audit_logs`
entry — fully auditable, idempotent (`ON CONFLICT` + a top-up-if-below-threshold check, not
an unconditional credit-on-every-call), and every response is explicitly tagged
`liveMoney: false`. `createOwnerTestCall()` then runs the **actual** production
`computeCallAuthorization()` / wallet-hold / `call_sessions` machinery against that
balance — this is not a fake shortcut, it exercises the real billing path end-to-end,
just funded with test credit instead of a real NextPay top-up. No provider API is called.
Impossible in Production for the same reason as everything else in this file:
`requireInternalOwnerTestAuthorization()` → `requireInternalOwnerTestMode()` →
`isInternalOwnerTestMode()` → `false` whenever `VERCEL_ENV=production`.

No source changes were made here either — reused as-is.

## 8. TURN

`services/api/src/providers/call-transport.ts` already keeps the Cloudflare TURN
`CLOUDFLARE_TURN_API_TOKEN` server-side only; the API exchanges it for short-lived
`RTCIceServer` credentials per call (`generateCloudflareIceServers`) and only the
short-lived credentials reach the client. This was not changed.

**Decision: Internal Beta Preview may reuse the same Cloudflare TURN application as
Production.** Reasoning: Cloudflare's TURN credential-generation endpoint mints a
short-lived (default 4h, capped 48h) username/credential pair scoped to the call; it does
not distinguish or leak which environment requested it, does not grant access to any
other environment's data, and the long-lived `CLOUDFLARE_TURN_KEY_ID`/`CLOUDFLARE_TURN_API_TOKEN`
never reach any client in either environment. The blast radius of sharing the TURN app is
"someone can relay WebRTC media through Cloudflare's TURN service" — not a data-isolation
or Production-access concern. If the owner later wants stronger separation (e.g. distinct
usage attribution/billing on Cloudflare's side), a second Cloudflare TURN application can
be created and its key/token set as Preview-only env vars on the API project with zero
code changes, since these are already plain env vars.

## 9. Recording — untouched

No RealtimeKit recording code was added. `recording_mode` stays `'none'` in every call
session created by the owner-test flow, matching the rest of the platform pre-W54.

## 10. Vercel Preview config — prepared, not deployed

**No Vercel dashboard change was made and no deployment was triggered.** Source/doc
support only. Key existing fact discovered during this work: **all three Vercel projects
in this repo (`vercel.json`, `apps/web/vercel.json`, `apps/admin/vercel.json`) already
have `"git": {"deploymentEnabled": false}`.** Pushing `w57/safe-internal-beta-preview-20260914`
will **not** auto-create Preview deployments — the owner must trigger them deliberately.
This is a pre-existing safety property (see [Access restriction](#11-access-restriction)),
not something introduced by W57.

### Exact owner-side setup (external, required before Preview is usable)

**A. Isolated Neon database** (see [Owner setup](#exact-isolated-neon-setup-needed) below
for full steps) — create it first; you need its connection string for step B.

**B. API project — Preview environment variables** (Vercel dashboard → API project →
Settings → Environment Variables → scope to **Preview**, ideally further scoped to the
`w57/safe-internal-beta-preview-20260914` branch only):

| Variable | Value |
|---|---|
| `INTERNAL_BETA_OWNER_TEST_MODE` | `1` |
| `INTERNAL_BETA_DATABASE_URL` | the isolated Neon Preview branch connection string (pooled) |
| `INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN` | a fresh random secret, ≥32 chars (e.g. `openssl rand -hex 32`) |
| `SMS_PROVIDER` | `dev` |
| `EMAIL_PROVIDER` | `dev` |
| `TELEPHONY_PROVIDER` | `dev` (optional — Internet Voice is primary transport and doesn't need this) |
| `DEV_EXPOSE_OTP` | `true` (only needed if you want to log in as a *non-synthetic* test account via real OTP, e.g. to test the Admin console; the synthetic Caller/Listener bootstrap never needs this) |
| `PHONE_HASH_PEPPER`, `EMAIL_HASH_PEPPER`, `IP_HASH_PEPPER`, `OTP_HASH_PEPPER`, `KYC_HASH_PEPPER` | fresh random secrets, distinct from Production's |
| `ACTIVE_DATA_ENCRYPTION_KEY_ID`, `DATA_ENCRYPTION_KEYS` | a fresh AES-256 key ring, distinct from Production's |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | same Cloudflare TURN app as Production (see [TURN](#8-turn)), or a dedicated Preview one |
| `DATABASE_URL` | leave **unset** — `isInternalOwnerTestMode()` overwrites it with `INTERNAL_BETA_DATABASE_URL` at runtime before it's ever read |
| `PRODUCTION_DATABASE_URL` | leave **unset** on Preview (it should only ever exist as a value to compare *against*, never as a live connection Preview itself uses) |

Do **not** set `PAYMENT_PROVIDER`, `NEXTPAY_*`, `KYC_INQUIRY_PROVIDER`, `PAYOUT_PROVIDER`,
`SMSIR_*`, `KAVENEGAR_*`, or `IPPANEL_*` on Preview — leave them blank exactly as
Production's own env-sync script (`scripts/sync-vercel-production-env.mjs`) already does
for the technical-beta deployment, so there is no live-provider dependency at all.

**C. Web project — Preview environment variables** (scoped to Preview / this branch):

| Variable | Value |
|---|---|
| `WEB_API_BASE_URL` | the API project's **stable Git-branch Preview URL** for this branch, e.g. `https://<api-project>-git-w57-safe-internal-beta-preview-20260914-<team>.vercel.app` (a normal per-deployment `*.vercel.app` URL also works but changes on every redeploy) |

`APP_ENV` does not need to be set — Vercel sets `VERCEL_ENV=preview` automatically for
Preview deployments, which `resolveAppEnv()` already maps to `preview_internal_beta`.

**D. Admin project — Preview environment variables:** same as C with `ADMIN_API_BASE_URL`
pointed at the same API Preview URL.

**E. Trigger the deployment.** Since Git deployments are disabled for these projects, use
one of:
- `vercel deploy` (not `--prod`) from a checkout of this branch, once per project, with
  the Vercel CLI logged into the correct scope/team; or
- Vercel dashboard → project → Deployments → "Create Deployment" pointed at
  `w57/safe-internal-beta-preview-20260914`.

This step is **not performed by this implementation** — it requires the owner's Vercel
credentials/CLI session and is explicitly out of scope for W57 per the no-deploy
instruction.

### Exact isolated Neon setup needed

1. In the Neon console, either create a **new project** dedicated to Internal Beta Preview,
   or a **new branch** off the existing project named e.g. `internal-beta-preview` — either
   way it must be a database Neon itself considers separate from the Production branch/project.
2. Copy its pooled connection string (`...-pooler...neon.tech/...`).
3. Apply the schema: from a checkout of this branch, with `DATABASE_URL` set to that
   connection string,
   ```bash
   npm run db:migrate
   ```
   (runs `packages/db/src/migrate.ts`, which applies `0001_initial.sql` through
   `0009_booking_reservation_sweeper.sql` in order — the same script used for every other
   environment, nothing bespoke).
4. Set that connection string as `INTERNAL_BETA_DATABASE_URL` in the API project's Preview
   environment (step B above). Never set it as that project's `DATABASE_URL`.
5. Confirm it is *not* textually equal to the Production connection string or hostname —
   `requireDedicatedInternalBetaDatabase()` will refuse to start otherwise (fail closed,
   `internal_beta_database_must_be_isolated`).

### Exact Preview smoke runbook

Once B–E above are done:

1. Open `https://<web-preview-url>/` to confirm the Web app itself loads (no API call yet).
2. Open `https://<api-preview-url>/v1/internal-beta/owner-test` (served by
   `serveOwnerTestPage`) — this page is inert without the owner token.
3. Enter `INTERNAL_BETA_OWNER_TEST_AUTH_TOKEN` and click "ساخت شنونده تست و اجرای تماس داخلی".
   This exercises, end to end, on the isolated DB only: synthetic Caller+Listener bootstrap
   with test wallet credit → Listener presence → marketplace visibility → call request →
   wallet hold/authorization → Internet Voice offer/answer signaling. Each step reports
   pass/fail inline.
4. Confirm in the Neon console (Preview branch) that the rows created are all tagged
   `[INTERNAL TEST DATA]` / the fixed synthetic UUIDs, and that Production's Neon
   project/branch shows zero new rows.
5. For report/block/Safety Exit/Claim/Resolve/Dismiss/suspend/unsuspend and billing
   settlement/no-answer/reconnect/extension smoke beyond the owner-test console — run the
   local isolated-Postgres suite (below), which already exercises all of these against a
   disposable database.

## 11. Access restriction

Layers, from outermost to innermost:

1. **Git deployment disabled** (existing, unchanged) — no Preview deployment is created by
   merely pushing a branch; the owner must deliberately deploy it.
2. **Vercel Deployment Protection** (recommended, external, owner-configured) — enable
   "Vercel Authentication" or a Password on the Preview deployments for this branch so the
   URL alone is not sufficient to reach the app.
3. **Application-level closed beta gate** (existing, unchanged) — `CALLER_CLOSED_BETA_ENABLED`
   stays `false`; real public caller signup/marketplace access remains closed on Preview
   exactly as it is everywhere except a fully commercially-approved Production. Only the
   two fixed synthetic identities can reach the internal-beta call flow.
4. **Owner Test token** (existing, unchanged) — every Internal Beta Preview-only route
   additionally requires the `x-internal-beta-owner-test-token` header.

No new source restriction was needed beyond what W25 already built; W57 documents the
combination and adds Deployment Protection as the recommended additional layer per the
task's own instruction not to rely on a secret URL alone.

## 12. Production hard blocks — automated negative tests

| Condition | Test |
|---|---|
| `APP_ENV=production` (with an attacker-supplied Preview API URL override) | `tests/preview-backend-routing-guard.test.ts` → "production always resolves the canonical Production API origin regardless of overrides" |
| Production hostname / identity | Modeled via `VERCEL_ENV=production`, which is the platform signal Vercel itself ties to the Production domain; same test as above plus `tests/internal-owner-test-mode.test.ts` → "production always blocks owner test mode..." |
| Production database identity/fingerprint | `tests/internal-owner-test-mode.test.ts` → "internal beta never falls back to a normal/production database and rejects obvious equality" (pre-existing, unchanged) |
| Production API origin (Preview misconfigured to point at it) | `tests/preview-backend-routing-guard.test.ts` → "preview_internal_beta rejects a Preview API URL that points at the Production origin" |
| Test-wallet endpoint in Production | `tests/internal-owner-test-mode.test.ts` → "production always blocks owner test mode even when every test flag and secret is set" (the bootstrap route that credits the test wallet is unreachable — `requireInternalOwnerTestMode()` throws 404 before any DB/wallet code runs) |
| Synthetic Owner test activation in Production | Same test as above, plus the authorization test's `VERCEL_ENV:'production'` case expecting `not_found` |
| Preview config missing required isolation identifiers | `tests/internal-owner-test-mode.test.ts` → "fails closed without the dedicated internal database" / "...without a strong owner authorization token"; `tests/preview-backend-routing-guard.test.ts` → "preview_internal_beta with a missing Preview API URL fails closed" |
| Dev SMS/Email/Telephony providers only widen under Owner Internal Beta mode, never bare Production | `tests/preview-provider-bypass-guard.test.ts` (new) |

## 13. W14 / W25 historical quarantine — preserved

`.github/workflows/w14-owner-test-preview.yml` remains the disabled "security quarantine"
stub (`exit 1`, unchanged). `.github/internal-beta-preview.env.allowlist` remains
unchanged (exactly the 3 W25-allow-listed names). No new GitHub Actions workflow was
added by W57. `tests/internal-owner-test-mode.test.ts`'s existing checks — no
`PRODUCTION_DATABASE_URL` reference, no `vercel pull --environment=production`, no
`INTERNAL_BETA_RUNTIME_ENV_B64`, no `base64` hydration, in any `*owner-test*` workflow —
were re-verified against the current tree and still pass unmodified. None of the W57
source changes (`_backend.ts`/`_env.ts` routing, provider dev-mode widening) touch
workflows, secrets, or database-URL hydration in any way that could reactivate the W14
pattern.

## 14 & 15. Safety and billing/voice smoke

Not re-implemented — these are exercised by the pre-existing test suite
(`admin-safety*.test.ts`, `safety-*.test.ts`, `call-*.test.ts`, `billing.test.ts`,
`internet-voice-*.test.ts`, `payment-*.test.ts`) and, live, by the owner-test console
runbook above (step 3), which literally drives report/Safety-Exit-adjacent call lifecycle
and billing hold/authorization through the real engine. W57 did not touch
`admin-safety.ts`, `admin-safety-enforcement.ts`, `safety.ts`, `call-lifecycle.ts`,
`internet-voice-lifecycle.ts`, or `packages/domain/src/billing.ts`. Economics unchanged:
Caller 40,000 IRR/min, Listener 28,000 IRR/min, 1-second billing increment
(`packages/config/src/index.ts`, `packages/db/migrations/0003_internet_voice_transport.sql`).

## 16. Testing — results

See [Test results](#test-results) below for the full run.

## 17. Home / Android — untouched

`apps/web/app/page.tsx` and `apps/web/app/home.module.css` were not opened for editing.
`apps/mobile` was not touched. No AAB was built. No versionCode was changed.

## Design notes

- **Why per-app `_env.ts` instead of a shared `@yeki-hast/config` export:** `apps/web` and
  `apps/admin` currently declare zero workspace dependencies (`package.json` lists only
  `next`/`react`/`react-dom`) — `_backend.ts` is deliberately self-contained so each app
  builds and deploys as an independent Vercel project without workspace resolution. Adding
  a first workspace dependency to fix a routing bug would have been a larger, riskier
  change than the bug warranted; two small identical files match the existing convention
  (`_backend.ts` itself is already duplicated per app) at negligible duplication cost.
- **Why `browserMutationAllowed()` was left on `NODE_ENV`:** it already fails closed
  correctly on Preview today (Preview's `NODE_ENV` happens to be `production`), and an
  existing test pins that exact behavior by toggling `NODE_ENV` directly. Rewiring it to
  `resolveAppEnv()` would not have fixed a bug — the API-origin routing was the actual W56
  finding — and would have meant re-deriving and re-proving a second identity check for no
  security benefit.
- **Why the SMS/Email/Telephony dev-provider gates were widened:** independently of the
  W56 finding, the same NODE_ENV-forced-to-production-on-Preview fact meant these
  providers' existing "forbidden in production" checks would *also* have misfired on a
  real Preview deployment, blocking `SMS_PROVIDER=dev`/`EMAIL_PROVIDER=dev` there and
  making it impossible to complete a real OTP-based login flow (e.g. for the optional
  Admin console) without live SMS.ir/Gmail credentials — the opposite problem from the
  routing bug, but the same root cause. Each was widened by exactly one clause,
  `&& !isInternalOwnerTestMode()`, reusing the existing fail-closed/DB-isolated/token-gated
  W25 primitive rather than inventing a new one. Production is provably unaffected because
  `isInternalOwnerTestMode()` always returns `false` when `VERCEL_ENV=production`,
  regardless of any other env var.
- **NextPay is the only payment/KYC-inquiry provider in this codebase** — grep for
  `vandar`/`jibit` found no matches anywhere. If those are genuinely planned providers,
  they don't exist yet and are out of scope for W57; "no live payment/KYC provider
  dependency in Preview" is fully satisfied because the owner-test flow never calls
  NextPay at all (test wallet credit is a ledger write, not a gateway call).

## Test results

Environment: Windows 11, Node 24.19.0 (repo pins `22.x`; dependencies installed with
`--engine-strict=false` since downgrading Node in-place wasn't practical without
uninstalling the machine's existing Node — no source code depends on Node-22-only
behavior, and every check below ran clean), npm 11.17.0, a disposable local PostgreSQL 16
(EnterpriseDB Windows binaries, no service, no install — initialized under a throwaway
data directory, listening on `127.0.0.1:5433` only, dropped after this run).

| Check | Result |
|---|---|
| `npm run typecheck` (all 7 workspaces: admin, mobile, web, api, db, domain, types) | **PASS**, 0 errors, all 7 |
| `apps/web` production build | **PASS** — 20 routes (matches W55: `/`, `/account/delete`, 5 `/api/*` handlers, `/booking`, `/booking/call`, `/faq`, `/listener`, `/listener/work`, `/manifest.webmanifest`, `/privacy`, `/safety`, `/safety/children`, `/talk`, `/terms`, `/trust`) |
| `apps/admin` production build | **PASS** — 15 routes (matches W55: `/`, `/account-deletions`, 5 `/api/*` handlers, `/calls`, `/payments`, `/payouts`, `/phone-verifications`, `/readiness`, `/safety`, `/waitlist`) |
| `apps/mobile` typecheck | **PASS**, 0 errors (untouched by W57) |
| `npm test` (full suite, `node --test`, no DB) | **738 pass / 0 fail / 2 skipped** (the 2 skips are the pre-existing `SAFETY_ADMIN_RUNTIME_DB_URL`-gated tests, same as the documented W55 baseline without a DB) |
| `npm test` with `SAFETY_ADMIN_RUNTIME_DB_URL` set to the disposable local Postgres | **758 pass / 0 fail / 0 skipped** — the 20 previously-skipped W36 runtime tests (`tests/admin-safety-runtime-db.test.ts`, `tests/admin-safety-enforcement-runtime-db.test.ts`) now run for real: suspend/unsuspend fail-closed/idempotent/reversible/audited, and the real Claim→Reviewing→Resolved/Dismissed handler against the actual `app.case_status` enum. 758 = 740 unique tests counted differently across the two runs (2 skip-placeholders become 20 real subtests) plus the 24 new W57 tests already included in both runs. |
| `node scripts/validate-foundation.mjs` | **PASS**, 54/54 checks, exit 0 |
| `npm --workspace @yeki-hast/db run migrate` against the disposable Postgres | Applied `0001_initial.sql` through `0005_no_answer_hold_idempotency.sql` cleanly. `0006_internet_voice_server_sweeper.sql` requires the **Neon-specific `pg_cron` extension with `cron.database_name` set** — this is not present in the standard EnterpriseDB Windows PostgreSQL binaries (confirmed: no `pg_cron` files anywhere in the installed tree) and is not practical to build from source in this environment. This is a genuine local-infrastructure gap, not a W57 regression: it blocks 0006 on every plain local Postgres, predates this branch, and real Neon (Production and any real Preview) supports `pg_cron` natively. No test in the suite actually required 0006–0009 to be applied (all 758 tests above passed against the 0001–0005 schema plus each test's own scoped fixtures) — see [W36 runtime run](#) above for the one place a live DB was actually exercised. |
| `npm --workspace @yeki-hast/db run check` against the disposable Postgres | **PASS** — confirms live `IRR 40,000/28,000/12,000`, 1-second increment pricing row |
| `node scripts/verify-production-security-config.mjs` | **Not run**, same as the W55 baseline: it hard-requires `NODE_ENV=production` plus real Production secrets (Gmail service account, live SMS/payment keys) that must never exist in this working copy or CI |
| W36 safety (claim/resolve/dismiss/suspend/unsuspend) | **PASS** — included in the 758, and the 20 real runtime-DB tests above specifically |
| Preview isolation tests | **PASS** — `tests/preview-backend-routing-guard.test.ts` (16 new tests) |
| Production negative tests | **PASS** — `tests/preview-provider-bypass-guard.test.ts` (8 new tests) plus pre-existing `tests/internal-owner-test-mode.test.ts` (13, unchanged), `tests/production-dev-provider-prohibition.test.ts` (3, unchanged) |
| Billing/voice smoke | **PASS** — included in the 758 (`billing.test.ts`, `call-authorization.test.ts`, `call-lifecycle-settlement.test.ts`, `internet-voice-*.test.ts`, `session-policy-v1-2.test.ts`, etc., all unchanged) |
| Home invariant | **PASS** — "frozen Home files retain the exact approved blobs" |
| W37 invariants | **PASS** — included in the 758 (mobile release/store/API-origin tests, all unchanged) |

A Windows-specific environment issue was found and fixed **locally only** (not committed):
this machine's global `git config core.autocrlf=true` was converting the repo's LF line
endings to CRLF on checkout, which broke two pre-existing byte-exact tests (`Home freeze
blobs remain exact`, and a regex in `internal-owner-test-mode.test.ts`) before any W57
code was even touched. Fixed by normalizing the working tree back to LF and setting
`core.autocrlf=false` in this **local clone's own `.git/config` only** (not global, not
committed, not affecting the remote or other clones). After that fix both tests pass
unmodified, confirming the repo's own line endings were never the problem.

## Remaining external owner setup

See [Vercel Preview config](#10-vercel-preview-config-prepared-not-deployed) above for the
full list. Summary: (1) create the isolated Neon Preview database and run migrations
against it, (2) set the API/Web/Admin Preview environment variables listed above on the
respective Vercel projects, (3) manually trigger a Preview deployment for this branch on
all three projects (Git deployments are disabled repo-wide), (4) enable Vercel Deployment
Protection on those Preview deployments, (5) run the owner-test console smoke runbook.

## Success criteria

PASS only if Preview source cannot silently reach Production. This holds:
`backendBaseUrl()` in both `apps/web` and `apps/admin` now fails closed (throws) rather
than falling back to `PRODUCTION_API_BASE_URL` whenever the resolved environment is
`preview_internal_beta` and either no Preview API URL is configured or it is configured to
the Production origin — proven by `tests/preview-backend-routing-guard.test.ts`. Real
Production's own routing, database isolation, owner-test-mode gating, and provider
fail-closed behavior are all unchanged and re-verified by the pre-existing test suite.
