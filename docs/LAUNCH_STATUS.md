# Launch Status — یکی هست

Last reviewed: 2026-08-31

This file is the repository source of truth for launch state. Future work should inspect the real repo, Vercel, Neon and provider state before trusting an older chat summary.

## Current source state

- Production deployment workflows are pinned to Vercel Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects.
- Automatic Vercel Git deployments are disabled; production deploys use the controlled workflows only.
- Production release tooling in Foundation QA, API deploy, frontend deploy, dependency-lock generation and EAS production is pinned to Node `22.23.1`; package manifests remain compatible with Node `22.x`.
- Root `package.json` pins release build tooling itself: `vercel` `59.3.0` and `esbuild` `0.25.9`. API/Web/Admin release workflows and Foundation QA execute the binaries from the lock-installed root `node_modules/.bin`; they do not fetch release tooling with runtime `npx --yes` calls.
- API/Web/Admin production workflows fail closed when the repository has no validated `package-lock.json`.
- Foundation QA and all production builds consume the committed workspace lock with `npm ci --ignore-scripts --no-audit --no-fund`. Foundation QA installs from the lock before tests/builds and verifies its lock-installed API bundler before use.
- Web/Admin `vercel.json` files force their Vercel build install step back to the monorepo root and use the validated root lock.
- API/Web/Admin production delivery follows Vercel's CI prebuilt pattern: pull production project settings, build the artifact inside the GitHub runner, verify `.vercel/output/config.json`, then deploy with `--prebuilt --prod`.
- API release now bundles and syntax-checks the production runtime before mutating Vercel production environment values.
- Manual production API, Web/Admin and DB-migration dispatches require exact confirmation phrases. Push-marker automation remains available for the intentionally narrow `.launch/*` paths.
- The production DB migration workflow is separately approved and target-locked: exact repo/main, exact approval marker, Neon `aws-us-east-2`, `neondb`, TLS, channel binding and an opaque SHA-256 fingerprint of the approved endpoint. Credentials and the endpoint hostname are not committed.
- The root API `vercel.json` and the controlled API release artifact both pin Vercel Function region `cle1`, aligning application compute with the Neon Ohio production project.
- The dependency-lock workflow uses Node `22.23.1`, generates the repository lock, verifies it with `npm ci`, commits it to `main`, then explicitly dispatches Foundation QA.
- `tests/production-deploy-target-guard.test.ts`, `tests/production-db-migration-guard.test.ts`, `tests/manual-production-dispatch-guard.test.ts`, `tests/technical-beta-provider-gate.test.ts` and `tests/public-support-surface.test.ts` guard the current release invariants.
- Public Web has first-party source pages for `/privacy`, `/terms` and `/account/delete`. The landing page links all three plus a real support route.
- Google Workspace mailbox `sales@uniqueholding.com.tr` was verified as bidirectional and is the default SMTP username/from/support identity unless deliberately overridden with another real mailbox.
- Public Web copy is truthful while Caller is closed and does not claim active voice calling before a real production provider path exists.
- Web/Admin production proxy code has an explicit production fallback to `https://yeki-hast-theta.vercel.app`, so missing optional `WEB_API_BASE_URL` / `ADMIN_API_BASE_URL` values do not silently point production to localhost.
- The frontend production workflow makes only the `web` Vercel project public after exact protected-deployment smoke checks. It never disables protection on `admin`, and it re-protects Web if public cutover fails.
- Admin readiness reports unavailable provider integrations as BLOCKED and does not expose credentials.
- A real root `package-lock.json` is committed. Expo SDK dependencies were aligned, `expo-doctor` passed all 21 checks, and an Android Preview EAS build completed successfully.
- Previously validated source commit `7238ab6921462095e97f25fe20e1114a02a8367a` passed all 474 source tests, full workspace typecheck, foundation validation, Web production build, Admin production build, Android export and iOS export. Current `main` is ahead of that baseline and requires a fresh real Foundation QA run before release.
- Mobile bootstrap is fail-closed: if the production bootstrap/catalog cannot be loaded, login and registration do not continue with stale fallback catalog data.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict cookies and production cookie names use the `__Host-` prefix.
- Browser POST proxy routes reject cross-site/same-site mutations and fail closed on missing browser request metadata in production.
- Web/Admin backend proxy requests have a 15-second upstream timeout and never add automatic mutation retries.
- Web/Admin declare CSP, anti-framing, no-sniff, referrer and browser-capability security headers in Vercel config.
- API JSON response helpers use no-store, no-sniff, anti-framing, no-referrer and restrictive JSON CSP headers.
- Account deletion is request-based and fail-closed: the request is written as pending, all active sessions are revoked immediately, re-login is blocked while pending, and the response explicitly says deletion is not yet complete. No destructive final-delete processor exists until retention rules are defined.
- Caller closed beta is disabled by default.
- Manual phone verification beta is disabled by default.
- Admin bootstrap is disabled by default.
- Production dev OTP and dev telephony are forbidden.

## Live production state last verified

- Vercel Team `UNIQUE` is the connected team and is currently on the Hobby plan.
- API `GET /health`: 200 / healthy.
- API `GET /ready`: 503 / not ready because the production schema has not yet been migrated/verified and deployed configuration has not been refreshed.
- The latest API production deployment inspected is READY at the Vercel deployment layer, but application readiness remains red because `/ready` is 503.
- Web production currently redirects an unauthenticated visitor to Vercel Authentication. The controlled frontend workflow will disable SSO only for project `web` after the exact protected Web build passes its pre-cutover smoke checks.
- Admin production remains intentionally protected by Vercel Authentication.
- The current live Web/Admin deployments predate the latest checked-in frontend source.
- Neon production project is `yeki-hast-production`, PostgreSQL 18, region `aws-us-east-2`, default branch `main`, database `neondb`.
- Neon metadata showed `written_data_bytes: 0` before migration; no application migration has been executed yet.
- `PRODUCTION_DATABASE_URL` is stored as a GitHub repository secret. The underlying credential must be rotated before migration if the value currently stored is the credential that was previously exposed outside the secret store.

A healthy `/health` alone is never sufficient to declare production ready.

## Current technical-beta blockers

### 1. GitHub Actions execution

GitHub Actions remains blocked at the account billing/payment layer. Recent Foundation QA and migration attempts create a workflow run but execute zero steps / no runner. This is not a source-code failure and it is not a QA PASS.

Required action: restore an Actions spending allowance/payment state, then run Foundation QA against exact current `main`.

### 2. Production DB credential rotation confirmation

A database credential was previously displayed outside the intended secret store. No matching credential or endpoint hostname is present in the repository, but the credential itself must be considered exposed.

Before migration, either confirm that Neon password reset/rotation already happened and `PRODUCTION_DATABASE_URL` was updated with the new direct connection string, or rotate it then update the GitHub secret. Do not paste the replacement value into chat or source.

### 3. Production migration and verification

After current HEAD has a real green Foundation QA and DB credential rotation is confirmed, execute only the guarded production migration workflow. It applies the repository's canonical migrations and then runs `scripts/verify-production-db.mjs` read-only.

Do not migrate the scratch/probe databases and do not bypass the exact endpoint guard.

### 4. Vercel production write credential

Controlled production deployment still requires repository secret `VERCEL_TOKEN`. The connected Vercel tool can inspect/deploy through its own authorization but does not expose a supported action to mint a CI access token for this repository.

Do not paste the token into chat or source.

### 5. Production Email OTP credential

The Google Workspace mailbox identity is now defaulted to the verified `sales@uniqueholding.com.tr`, so a separate SMTP username/from/support secret is not required for the normal path.

Remaining secure input: `PRODUCTION_SMTP_PASSWORD` (a valid Google Workspace App Password or equivalent credential accepted for the real mailbox). The production release performs real SMTP delivery plus IMAP observation, OTP verification, session verification and logout/revocation smoke.

### 6. Vercel commercial plan before paid launch

Team `UNIQUE` is currently Hobby. Before any paid/commercial YEKI-HAST traffic is opened, move the workload to an eligible commercial plan and re-verify the project state. Do not spend on this until the technical beta gates are green unless there is a separate reason to do so.

## Technical beta scope

The smallest intended release is a truthful Web/API technical beta:

- Email authentication and account/session plumbing may open after real production E2E PASS.
- Public Privacy, Terms, Account Deletion and Support surfaces may open after frontend smoke PASS.
- Admin remains protected.
- Caller voice remains closed.
- Payment, telephony, payout, KYC and final call-phone verification are not technical-beta prerequisites and are not required by the controlled API release workflow.
- Native mobile store submission is not a technical-beta prerequisite. Existing preview linkage/build remains useful for later validation.

## Provider-gated product surfaces

These remain external integration gates, not missing behavior to guess around:

- Caller voice launch: production telephony contract, documented semantics and verified credentials.
- Caller payments: real production credentials and callback verification.
- Listener payout: real payout credentials plus live verification.
- Listener KYC completion: real KYC inquiry provider configuration plus live verification.
- Call-phone verification: real provider credentials/template approval and delivery verification for the final Caller flow.
- Caller launch: explicit age-policy values plus all readiness dependencies.

Until those dependencies are real, the corresponding production surfaces remain closed/fail-closed.

## Controlled technical-beta sequence

1. Fix GitHub Actions billing/payment so a real runner executes.
2. Confirm current production DB credential has been rotated after any exposure and the GitHub secret contains only the rotated value.
3. Run Foundation QA on exact current `main`; require every step to execute and pass.
4. Execute the separately guarded production DB migration with its deliberate confirmation gate.
5. Require `scripts/verify-production-db.mjs` PASS.
6. Add secure `VERCEL_TOKEN` and `PRODUCTION_SMTP_PASSWORD` repository secrets.
7. Trigger controlled Production API deploy using its explicit manual confirmation or the narrow launch marker.
8. Require `/health` 200 with exact release SHA, `/ready` 200 with database/schema ready, valid `/v1/bootstrap`, and real Email OTP E2E PASS.
9. Trigger controlled frontend deploy using its explicit manual confirmation or the narrow launch marker.
10. Require exact protected Web/Admin pre-cutover smoke, then make only Web public.
11. Require unauthenticated public PASS for `/`, `/privacy`, `/terms`, `/account/delete` and protected Admin PASS.
12. Keep Caller and its provider-gated flows closed.
13. Upgrade commercial hosting only before paid/commercial traffic, not merely to perform source QA.

## Non-negotiable rules

- No Codex for this project.
- Do not touch Evidence Axis.
- No DB migration outside the explicitly approved exact-target workflow.
- Never guess provider behavior or provider references.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it was actually tested.
