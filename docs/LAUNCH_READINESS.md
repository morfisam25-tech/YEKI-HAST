# Listener APP / «یکی هست» — Launch Readiness

Last reviewed: 2026-08-29

This document is the source of truth for launch work. A component is not considered launch-ready merely because it builds; live production checks must pass.

## Non-negotiable production rules

- Production Vercel team: `UNIQUE` only.
- Production API project: `yeki-hast` only.
- No database migration/reset/role creation without explicit approval.
- No invented telephony semantics, provider references or fake production OTP behavior.
- Production remains fail-closed when a required provider or policy is unavailable.
- Secrets, bank details and provider credentials must never be committed or printed.

## Source implementation currently present

- Email OTP auth and secure sessions.
- Listener onboarding, training, assessment, KYC foundation and work/presence flows.
- Wallet, payment foundation, payout foundation and operational Admin surfaces.
- Caller marketplace, age gate, call lifecycle, safety report/block/exit flows.
- Caller top-up creation is closed unless Caller beta is enabled and the current age policy has been accepted.
- Existing payment verification/callback paths remain available so in-flight money cannot be stranded when Caller is closed.
- Browser mutation proxies fail closed against cross-site requests in production.
- API/Web/Admin production runtime is pinned to Node 22 source/build expectations.
- Production database preflight is read-only and checks migration hashes, required relations, critical triggers, pricing and active language seed.
- Public-release readiness requires valid Privacy Policy, Terms of Service, Account Deletion and Support surfaces before Caller can be considered launch-ready.
- Mobile always displays the boundary that the service is not therapy, professional counselling or an emergency service.
- Admin readiness shows public-release and one-time admin-bootstrap gates without exposing secret values.

## Account deletion

Implemented self-service request flow:

1. User verifies ownership through Email OTP on the public Web deletion page.
2. User explicitly confirms the destructive action.
3. API records an idempotent `account_deletion_requested` audit event.
4. All active sessions for the user are revoked immediately.
5. New Email OTP or Phone OTP login sessions are blocked while the request remains in `pending` processing state.
6. The product does **not** claim final deletion/anonymization has completed.

Canonical first-party deletion page for the current Vercel surface:

`https://web-unique-6ff0.vercel.app/account/delete`

Final physical deletion/anonymization is intentionally not automated until retention requirements for financial, safety and other necessary records are defined and reviewed.

## Live production state that must be re-verified at launch

Current production API alias:

`https://yeki-hast-theta.vercel.app`

As of the latest review:

- `/health` returns HTTP 200.
- `/ready` still returns HTTP 503 `service_not_ready`.
- Production must not be declared ready until `/ready` and `/v1/bootstrap` both return successful, validated responses from the exact current release.

## External / irreducible blockers

### Infrastructure credentials

- `VERCEL_TOKEN` with access to the exact UNIQUE team/projects.
- `PRODUCTION_DATABASE_URL` for the exact Neon production project/branch/database.
- `PRODUCTION_SMTP_USERNAME` for the intentionally selected Google Workspace mailbox.
- `PRODUCTION_SMTP_PASSWORD` / App Password for that mailbox.

The connected Neon tool currently has a reproducible parameter-schema mismatch and cannot return/use the production connection string. A report has been sent to Neon through their product-team feedback channel. Do not invent a connection string.

### Public policy/support

Before Caller can open, configure real values for:

- Privacy Policy URL.
- Terms of Service URL.
- Support email.

The Account Deletion URL has a first-party default. Privacy/Terms text, legal identity/jurisdiction, retention promises and support identity must not be fabricated.

### Caller voice launch

A real telephony provider and its exact documented production semantics/credentials are still required before real calls can open. Do not implement a fake provider or infer undocumented behavior.

Caller age policy values must also be intentionally configured before opening Caller.

### Payments / listener operations

Provider credentials must be verified for the production scope actually being opened. Caller readiness currently requires the payment provider. KYC/payout readiness remains separately visible in Admin and must be completed before corresponding listener operations are offered as production-ready.

### Mobile store release

The source has Android/iOS identifiers and EAS build profiles, but store release still requires:

- Expo/EAS project linkage (`projectId`) from a real Expo project.
- Production app icon/splash assets.
- Signing/store credentials and store accounts.
- Final store listing/privacy metadata and a signed production build.

Do not call the mobile app Store-ready until those are completed and an actual signed build is verified.

## GitHub Actions status

The account has exhausted the included GitHub Actions minutes for the current cycle. Recent runs fail before useful work begins, so those failures are not evidence of a source-code test failure.

Last known fully green baseline before quota exhaustion:

- Commit: `85d44618b932d0703c21f16f8d6de22ee8f336e1`
- Run: `33226498053`

All source/config changes after that baseline must receive a fresh full Foundation QA run before production launch. Do not label the current HEAD CI-green until that happens.

A dependency lock still needs to be generated/validated in a networked runner. Once valid, production CI/deploy should prefer `npm ci` rather than an unlocked install.

## Final activation sequence

After GitHub Actions capacity and required credentials are available:

1. Read latest `main` HEAD and ensure no concurrent changes were missed.
2. Generate/validate the dependency lock and run the full Foundation QA on latest HEAD.
3. Fix any real test/type/build failure; do not dismiss failures as quota once a runner actually starts.
4. Read-only verify the exact production Neon database with `scripts/verify-production-db.mjs`.
5. Sync production API environment to the exact UNIQUE API project without exposing values.
6. Deploy the exact API bundle to UNIQUE.
7. Require live `/health`, `/ready` and `/v1/bootstrap` smoke tests to pass.
8. Run the real Email OTP delivery → verify → session → logout production E2E.
9. Inspect production runtime errors/logs.
10. Deploy Web and Admin to their exact UNIQUE projects.
11. Smoke the Web landing page and `/account/delete` public page.
12. Smoke protected Admin and inspect the readiness screen.
13. Perform a real authenticated Web/mobile flow and first-admin bootstrap only through the guarded auth mechanism, then ensure bootstrap configuration is fully cleared.
14. Configure and test the real provider set for the V1 scope.
15. Enable Caller only after the Admin readiness endpoint reports all Caller launch gates ready.

## Definition of launch-ready

Do not mark the project launch-ready until all applicable items below are true in live production:

- Latest HEAD passed Foundation QA.
- Production database preflight passed read-only.
- API `/ready` is HTTP 200.
- API `/v1/bootstrap` is HTTP 200 with expected market/language/policy configuration.
- Real Email OTP E2E passed.
- Web and Admin exact production deployments passed smoke tests.
- Admin bootstrap is locked down after initialization.
- Public Privacy, Terms, Account Deletion and Support surfaces are valid.
- Real provider integrations required for the chosen V1 scope passed production tests.
- Caller remains closed until its complete launch-readiness gate is true.
- Mobile is only called Store-ready after a verified signed store build exists.
