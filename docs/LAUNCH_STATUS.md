# Launch Status — یکی هست

Last reviewed: 2026-08-29

This file is the repository source of truth for launch state. Future work should inspect the real repo, Vercel, Neon and provider state before trusting an older chat summary.

## Current source state

- Production deployment workflows are pinned to Vercel Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects.
- Automatic Vercel Git deployments are disabled; production deploys use the controlled workflows only.
- Production release tooling in Foundation QA, API deploy, frontend deploy, dependency-lock generation and EAS production is pinned to Node `22.23.1`; package manifests remain compatible with Node `22.x`.
- The frontend deployment workflow checks out the exact repository source before touching `apps/web` or `apps/admin`.
- API and frontend production deployment workflows now fail closed when the repository has no validated `package-lock.json` and use `npm ci --ignore-scripts --no-audit --no-fund` before deployment.
- Foundation QA also consumes the committed dependency lock with `npm ci`; the dedicated one-shot lock workflow remains responsible for generating and validating the repository's first real lockfile. Do not fabricate a lockfile.
- `tests/production-deploy-target-guard.test.ts` guards the authorized team/projects, source checkout, exact Node release, dependency-lock requirement, `npm ci`, public Web smoke and protected Admin smoke.
- Production API/Web/Admin builds and Android/iOS exports were proven green on an older source state before the GitHub Actions allowance was exhausted. Current HEAD is not considered green until a real current QA run executes and passes.
- Mobile bootstrap is fail-closed: if the production bootstrap/catalog cannot be loaded, login and registration do not continue with stale fallback catalog data.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict cookies and production cookie names use the `__Host-` prefix.
- Browser POST proxy routes reject cross-site/same-site mutations and fail closed on missing browser request metadata in production.
- Web/Admin backend proxy requests have a 15-second upstream timeout and never add automatic mutation retries.
- Web/Admin declare CSP, anti-framing, no-sniff, referrer and browser-capability security headers in Vercel config.
- API JSON response helpers explicitly use `no-store`, no-sniff, anti-framing, no-referrer and restrictive JSON CSP headers.
- The payment callback HTML is non-cacheable, anti-framed, no-referrer, no-script and protected by a restrictive CSP; it does not render provider or internal payment identifiers.
- Caller closed beta is disabled by default.
- Manual phone verification beta is disabled by default.
- Admin bootstrap is disabled by default and its one-time enablement requires an expiry window.
- Production dev OTP and dev telephony are forbidden.
- No database migration is authorized or required by the current launch workflow.

## Live production state last verified

- Vercel Team `UNIQUE` is the connected team and is currently on the Hobby plan.
- API `GET /health`: 200 / healthy.
- API `GET /ready`: 503 / not ready.
- API `GET /v1/bootstrap`: 503 / blocked by the readiness gate.
- The latest API production deployment inspected is READY at the Vercel deployment layer, but application readiness remains red because `/ready` is 503.
- Web production currently redirects an unauthenticated visitor to Vercel Authentication. That is acceptable for Admin but is a blocker for the public Web surface; public login and `/account/delete` must be reachable without Vercel authentication before the Web smoke can pass.
- The current Web/Admin production deployments predate the latest checked-in frontend source, including the new public account-deletion page.
- Admin production remains intentionally protected by Vercel Authentication; the controlled frontend workflow uses authenticated `vercel curl` for its Admin post-deploy smoke instead of weakening that protection.

A healthy `/health` alone is never sufficient to declare production ready.

## External blockers

### 1. GitHub Actions execution

The account reached the included Actions allowance on 2026-08-29. Current Foundation QA runs complete in roughly four seconds with a job record but zero executed steps. Do not interpret those runs as source failures or source success.

When Actions execution is available again, run the dedicated dependency-lock workflow first. It must generate `package-lock.json`, validate it with `npm ci`, and commit the real lock. The resulting current `main` must then receive a true Foundation QA green run. CI/deploy source is already configured to consume the lock with `npm ci`; no later install-command conversion is required.

### 2. Production database credential

The Neon project/branch/database are known, but the connected Neon tool still has a schema mismatch: the client exposes `projectId`/`branchId`/`databaseName` while the backend rejects those keys and requires snake_case fields. Both connection-string retrieval and a read-only `SELECT 1` fail at argument validation before reaching the database.

Do not invent or reconstruct the database password. Required secure input for automated production deployment: `PRODUCTION_DATABASE_URL`.

### 3. Vercel production write credential

The current Vercel connector can inspect the intended UNIQUE projects but does not expose the environment-variable write path needed by the controlled deployment workflow. The workflow therefore requires repository secret `VERCEL_TOKEN`. Do not paste the token into chat.

### 4. Public Web Vercel protection

The canonical Web production alias currently redirects unauthenticated visitors to Vercel Authentication. Before public Web deployment can pass its release smoke, remove production deployment protection from the Web project or otherwise make the canonical Web production surface public through an approved Vercel configuration. Keep Admin protection enabled.

The production Web smoke intentionally uses an unauthenticated request with redirects disabled. Do not bypass this gate with a temporary share link or authenticated smoke.

### 5. Production Email OTP mailbox

The deployment workflow defaults to Google Workspace SMTP (`smtp.gmail.com`, port 465, TLS) and performs a real delivery/verify/session/logout E2E test.

Required secure inputs:
- `PRODUCTION_SMTP_USERNAME`
- `PRODUCTION_SMTP_PASSWORD` (Google Workspace App Password or other valid mailbox credential)

Do not fake OTP delivery in production.

### 6. Public release policy values

Public release remains fail-closed until real values exist for:
- Privacy Policy URL
- Terms of Service URL
- Support Email

The account-deletion URL has a first-party default. Do not invent legal operator, jurisdiction or policy text merely to make the readiness gate green.

### 7. Mobile EAS project linkage and release artwork

The checked-in mobile configuration is build-profile ready but not yet EAS/store-distribution ready:

- `apps/mobile/app.json` does not currently contain `extra.eas.projectId`; do not invent an Expo project ID. EAS must be linked to the real Expo account/project before a non-interactive production EAS build.
- The mobile project currently has no checked-in production app icon/adaptive-icon artwork and `app.json` does not point to release icon assets. Do not ship a default/placeholder Expo identity as a finished store release.
- The production EAS profile already pins Node 22.23.1, uses the canonical production API, requires a committed source state and uses remote auto-incremented native build versions.
- Android signing/store credentials and Apple signing/App Store credentials still require real external account setup and verification.

These mobile-store items do not justify opening any unready backend surface.

### 8. Vercel commercial plan before paid launch

Vercel Team `UNIQUE` is currently on Hobby. Before paid/commercial traffic is opened, verify the then-current Vercel plan requirements and move this production workload to an eligible commercial plan if required. Do not open paid Caller flows while the hosting plan is not cleared for that use.

## Provider-gated product surfaces

These are external integration gates, not missing behavior to guess around:

- Caller voice launch: production telephony contract, documented semantics and verified credentials. The source telephony provider currently has only the development implementation; production unknown providers fail closed.
- Caller payments: real NextPay production credentials and callback configuration plus live verification.
- Listener payout: real payout credentials plus live verification.
- Listener KYC completion: real KYC inquiry provider configuration plus live verification.
- Call-phone verification: the source has real Kavenegar, IPPanel and SMS.ir adapters, but launch still requires real provider credentials/template approval and delivery verification. Dev SMS remains forbidden in production.
- Caller launch: explicit age-policy values plus all readiness dependencies.

Until those dependencies are real, the corresponding production surfaces must remain closed/fail-closed.

## Controlled launch sequence

Once Actions execution and the required external credentials exist securely:

1. Run the dedicated dependency-lock workflow. Require successful lock generation, `npm ci` validation and commit of the real `package-lock.json`.
2. Require a true green Foundation QA run on the resulting current `main`.
3. Add only the required repository secrets through secure GitHub storage; never place credentials in source or chat.
4. Trigger the controlled Production API workflow.
5. Require production DB verification without migrations.
6. Require `/health` 200, `/ready` 200 with `database: "ready"` and `schema: "ready"`, and a valid `/v1/bootstrap` response.
7. Require real Email OTP delivery, verification, authenticated session and logout/revocation E2E PASS.
8. Make the canonical Web production surface public at the Vercel protection layer while keeping Admin protected.
9. Deploy Web and Admin through the exact UNIQUE frontend workflow and require both live smoke gates, including public `/account/delete`.
10. Review Admin integration-readiness output with secrets excluded.
11. Link the real Expo/EAS project and add approved production release artwork before calling the native app store-ready; then complete real signing/build/store verification.
12. Clear the hosting plan for commercial use before opening any paid traffic.
13. Keep Caller beta closed until telephony/payment/phone/age/public-release gates are all genuinely ready.
14. Only then enable the smallest intended beta surface and monitor runtime errors.

## Non-negotiable rules

- No Codex for this project.
- Do not touch Evidence Axis.
- No DB migration without explicit user approval.
- Never guess provider behavior or provider references.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it was actually tested.
