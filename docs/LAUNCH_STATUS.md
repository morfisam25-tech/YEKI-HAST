# Launch Status — یکی هست

Last reviewed: 2026-08-31

This file is the repository source of truth for launch state. Future work should inspect the real repo, Vercel, Neon and provider state before trusting an older chat summary.

## Current source state

- Production deployment workflows are pinned to Vercel Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects.
- Automatic Vercel Git deployments are disabled; production deploys use the controlled workflows only.
- Production release tooling in Foundation QA, API deploy, frontend deploy, dependency-lock generation and EAS production is pinned to Node `22.23.1`; package manifests remain compatible with Node `22.x`.
- Root `package.json` pins release build tooling itself: `vercel` `59.3.0` and `esbuild` `0.25.9`. API/Web/Admin release workflows and Foundation QA execute the binaries from the lock-installed root `node_modules/.bin`; they do not fetch release tooling with runtime `npx --yes` calls.
- API/Web/Admin production workflows fail closed when the repository has no validated `package-lock.json`.
- Foundation QA and all production builds consume the committed workspace lock with `npm ci --ignore-scripts --no-audit --no-fund`.
- Web/Admin `vercel.json` files force their Vercel build install step back to the monorepo root and use the validated root lock.
- API/Web/Admin production delivery follows Vercel's CI prebuilt pattern and automatic Git deployment is disabled.
- API release bundles and syntax-checks the production runtime before mutating Vercel production environment values.
- Manual production API, Web/Admin and DB-migration dispatches require exact confirmation phrases. Push-marker automation remains limited to narrow `.launch/*` paths.
- The production DB migration workflow is separately approved and target-locked: exact repo/main, exact approval marker, Neon `aws-us-east-2`, `neondb`, TLS, channel binding and an opaque SHA-256 fingerprint of the approved endpoint. Credentials and endpoint hostname are not committed.
- Before any schema mutation, `scripts/preflight-production-db-migration.mjs` performs a read-only state check. A first migration is allowed only when `app`, `private_data` and the migration tracking table are absent. A rerun is allowed only when migration history contains known filenames with exact locked hashes and valid order/state.
- Migration remains hash-tracked/idempotent and is followed by `scripts/verify-production-db.mjs` read-only verification of migration hashes, critical relations/triggers and canonical Iran seed/pricing data.
- The root API `vercel.json` and the controlled API release artifact both pin Vercel Function region `cle1`, aligning application compute with Neon Ohio.
- Production API smoke requires exact release SHA, `/ready` database/schema readiness, Caller closed, and `legal.ready === true` with the exact policy URLs and verified support identity.
- Public support identity is deliberately locked to the verified bidirectional Google Workspace mailbox `sales@uniqueholding.com.tr` across API bootstrap and checked-in Web source. It cannot drift via a secret-only override.
- Protected Web pre-cutover smoke and public Web post-cutover smoke both require the real support `mailto:` route before release can pass.
- The frontend release keeps Admin protected, validates exact protected Admin/Web deployments before cutover, makes only Web public, and re-protects Web if public verification fails.
- Public Home copy is truthful while Caller is closed and does not claim active voice calling before a real provider path exists.
- Web/Admin production proxy code has an explicit production fallback to `https://yeki-hast-theta.vercel.app`; missing optional API-base env values cannot silently point production to localhost.
- `.vercel`, `dist-api`, `.env` and `.env.*` are ignored so project bindings, pulled env files and release artifacts cannot be committed accidentally; `.env.example` remains intentionally committable.
- The dependency-lock workflow uses Node `22.23.1`, validates the lock and explicitly dispatches Foundation QA after a workflow-created lock commit.
- Release invariants are guarded by source tests including production deploy target, migration target/state, manual dispatch, closed-provider beta scope, support surface and release-artifact hygiene tests.
- A real root `package-lock.json` is committed. Expo SDK dependencies were aligned, `expo-doctor` passed all 21 checks, and an Android Preview EAS build completed successfully.
- Previously validated source commit `7238ab6921462095e97f25fe20e1114a02a8367a` passed all 474 source tests, full workspace typecheck, foundation validation, Web/Admin production builds and Android/iOS exports. Current `main` is ahead of that baseline and requires a fresh real Foundation QA run before release.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict cookies and `__Host-` names.
- Browser POST proxy routes reject cross-site/same-site mutations and fail closed on missing browser metadata in production.
- Web/Admin backend proxy requests have a 15-second timeout and no automatic mutation retries.
- Account deletion remains request-based/fail-closed; no destructive processor exists until retention rules are defined.
- Caller closed beta, manual phone verification beta and Admin bootstrap are disabled by default.
- Production dev OTP and dev telephony are forbidden.

## Live production state last verified

- Vercel Team `UNIQUE` is connected and currently on Hobby.
- API `GET /health`: 200 / healthy.
- API `GET /ready`: 503 / not ready because the production schema has not yet been migrated/verified and deployed configuration has not been refreshed.
- Web production redirects unauthenticated visitors to Vercel Authentication; it has not yet been cut over public.
- Admin production remains intentionally protected by Vercel Authentication.
- Current live Web/Admin deployments predate the latest checked-in frontend source.
- Neon production project is `yeki-hast-production`, PostgreSQL 18, `aws-us-east-2`, default branch `main`, database `neondb`.
- Neon metadata showed `written_data_bytes: 0` before migration; no application migration has executed yet.
- `PRODUCTION_DATABASE_URL` is stored as a GitHub repository secret.
- A database credential was previously exposed outside the intended secret store. The repository does not contain that credential or endpoint hostname, but credential rotation must be confirmed before migration.

A healthy `/health` alone is never sufficient to declare production ready.

## Current technical-beta blockers

### 1. GitHub Actions execution

Actions remains blocked at the account billing/payment layer. Recent workflow attempts create runs but execute zero steps / no runner. This is not a source-code failure and not a QA PASS.

Required action: restore Actions spending/payment state, then run Foundation QA against exact current `main`.

### 2. Production DB credential rotation confirmation

Before migration, confirm that the Neon password was reset after exposure and `PRODUCTION_DATABASE_URL` was updated with the rotated direct connection string. If not, rotate then update the GitHub secret. Never paste the replacement value into chat/source.

### 3. Production migration and verification

After a real green Foundation QA and credential-rotation confirmation, execute only the guarded migration workflow. It must pass exact target validation, read-only DB-state preflight, canonical repository migrations and post-migration read-only verification.

### 4. Vercel production write credential

Controlled exact-project production workflows still require repository secret `VERCEL_TOKEN`. The connected Vercel tool can inspect deployments but its generic deploy action does not accept an explicit project/team target, so it is not being used as a substitute for the controlled UNIQUE project workflows.

### 5. Production Email OTP credential

Normal production path needs only `PRODUCTION_SMTP_PASSWORD` as the remaining mailbox secret. SMTP username/from default to the verified Workspace mailbox. Release performs real SMTP delivery + IMAP observation + OTP verify + session + logout/revocation E2E.

### 6. Operational Admin identity before an operational beta

Admin UI additionally requires application-level Email OTP plus an active `app.admin_users` role. Fresh migration does not invent an admin, and normal production env sync deliberately keeps one-time Admin bootstrap disabled/cleared.

This is not required to expose the smallest non-operational Web/API technical surface, but an operational beta that accepts workflows requiring human review must establish a real owner/admin through the guarded one-time bootstrap flow and then return bootstrap to locked-down state.

### 7. Vercel commercial plan before paid launch

Hobby must not be used for paid/commercial traffic. Do not spend on the upgrade merely to finish source QA; move to an eligible plan before opening paid traffic.

## Technical beta scope

The smallest intended release is a truthful Web/API technical beta:

- Email authentication and account/session plumbing may open only after real production E2E PASS.
- Public Privacy, Terms, Account Deletion and Support surfaces may open only after frontend smoke PASS.
- Admin remains protected.
- Caller voice remains closed.
- Payment, telephony, payout, KYC and final call-phone verification are not technical-beta prerequisites and are not required by the controlled API release workflow.
- Native mobile store submission is not a technical-beta prerequisite.

## Provider-gated product surfaces

These remain external integration gates, not behavior to guess around:

- Caller voice: production telephony contract, documented semantics and credentials.
- Caller payments: real credentials/callback verification.
- Listener payout: real payout credentials/live verification.
- Listener KYC: real inquiry provider/live verification.
- Final call-phone verification: real provider credentials/template approval/delivery verification.
- Caller opening: explicit age-policy values plus all readiness dependencies.

## Controlled technical-beta sequence

1. Fix GitHub Actions billing/payment so a real runner executes.
2. Confirm production DB credential rotation after exposure and ensure the GitHub secret contains only the rotated value.
3. Run Foundation QA on exact current `main`; every step must execute and pass.
4. Execute the guarded production DB migration with deliberate confirmation.
5. Require DB-state preflight and `verify-production-db.mjs` PASS.
6. Add secure `VERCEL_TOKEN` and `PRODUCTION_SMTP_PASSWORD` repository secrets.
7. Trigger controlled Production API deploy.
8. Require exact release SHA, `/ready` 200, valid READY bootstrap/legal/support state and real Email OTP E2E PASS.
9. Trigger controlled frontend deploy.
10. Require protected exact pre-cutover Web/Admin smoke, then public Web smoke including support route; Admin stays protected.
11. Keep Caller/provider-gated flows closed.
12. Establish a real application admin before moving from a purely technical beta to operations requiring human review.
13. Upgrade commercial hosting before paid/commercial traffic.

## Non-negotiable rules

- No Codex for this project.
- Do not touch Evidence Axis.
- No DB migration outside the explicitly approved exact-target workflow.
- Never guess provider behavior or references.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it was actually tested.
