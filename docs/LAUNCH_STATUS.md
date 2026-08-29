# Launch Status — یکی هست

Last reviewed: 2026-08-29

This file is the repository source of truth for launch state. Future work should inspect the real repo, Vercel, Neon and provider state before trusting an older chat summary.

## Current source state

- Production deployment workflows are pinned to Vercel Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects.
- Automatic Vercel Git deployments are disabled; production deploys use the controlled workflows only.
- Production release tooling in Foundation QA, API deploy, frontend deploy, dependency-lock generation and EAS production is pinned to Node `22.23.1`; package manifests remain compatible with Node `22.x`.
- Root `package.json` pins release build tooling itself: `vercel` `59.3.0` and `esbuild` `0.25.9`. API/Web/Admin release workflows and Foundation QA execute the binaries from the lock-installed root `node_modules/.bin`; they do not fetch release tooling with runtime `npx --yes` calls.
- API/Web/Admin production workflows fail closed when the repository has no validated `package-lock.json`.
- Foundation QA and all production builds consume the committed workspace lock with `npm ci --ignore-scripts --no-audit --no-fund`. Foundation QA now installs from the lock before tests/builds and verifies its lock-installed API bundler before use.
- Web/Admin `vercel.json` files force their Vercel build install step back to the monorepo root and use the validated root lock.
- API/Web/Admin production delivery follows Vercel's CI prebuilt pattern: pull production project settings, build the artifact inside the GitHub runner, verify `.vercel/output/config.json`, then deploy with `--prebuilt --prod`. Production no longer depends on a second remote source install after CI validated the lock.
- The dependency-lock workflow uses Node `22.23.1`, generates the repository's first real lock, verifies it with `npm ci`, commits it to `main`, then explicitly dispatches Foundation QA. `foundation-qa.yml` supports `workflow_dispatch` because a push made by the workflow's `GITHUB_TOKEN` does not itself trigger another push workflow.
- `tests/production-deploy-target-guard.test.ts` guards the authorized team/projects, source checkout, exact Node release, exact lock-manifest tooling versions, dependency-lock requirement, lock-to-QA handoff, `npm ci`, prebuilt production deploys, public Web smoke and protected Admin smoke.
- Public Web now has first-party source pages for `/privacy`, `/terms` and `/account/delete`. The landing page links all three.
- API production env sync has canonical first-party defaults for Privacy, Terms and Account Deletion URLs on `https://web-unique-6ff0.vercel.app`; a real Support Email remains an explicit external input and is never inferred from an SMTP sender.
- The frontend production workflow makes only the `web` Vercel project public by disabling Vercel Authentication SSO through the official Vercel CLI before deployment. It does not disable protection on `admin`.
- Web production smoke is intentionally unauthenticated with redirects disabled and requires `/`, `/privacy`, `/terms` and `/account/delete` all to return valid public content.
- Admin production has two separate gates: an unauthenticated request must receive an actual protection status (3xx, 401 or 403; 404/5xx do not count), then authenticated Vercel CLI access must return the real Admin shell.
- Production API/Web/Admin builds and Android/iOS exports were proven green on an older source state before the GitHub Actions allowance was exhausted. Current HEAD is not considered green until a real current QA run executes and passes.
- Mobile bootstrap is fail-closed: if the production bootstrap/catalog cannot be loaded, login and registration do not continue with stale fallback catalog data.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict cookies and production cookie names use the `__Host-` prefix.
- Browser POST proxy routes reject cross-site/same-site mutations and fail closed on missing browser request metadata in production.
- Web/Admin backend proxy requests have a 15-second upstream timeout and never add automatic mutation retries.
- Web/Admin declare CSP, anti-framing, no-sniff, referrer and browser-capability security headers in Vercel config.
- API JSON response helpers explicitly use `no-store`, no-sniff, anti-framing, no-referrer and restrictive JSON CSP headers.
- The payment callback HTML is non-cacheable, anti-framed, no-referrer, no-script and protected by a restrictive CSP; it does not render provider or internal payment identifiers.
- Account deletion is request-based and fail-closed: the request is written as pending, all active sessions are revoked immediately, re-login is blocked while pending, and the response explicitly says deletion is not yet complete. The Admin queue exposes internal user ID + processing state only and has no destructive final-delete action until retention rules for financial/safety/open records are defined.
- Caller closed beta is disabled by default.
- Manual phone verification beta is disabled by default.
- Admin bootstrap is disabled by default and its one-time enablement requires an expiry window.
- Production dev OTP and dev telephony are forbidden.
- No database migration is authorized or required by the current launch workflow.

## Live production state last verified

- Vercel Team `UNIQUE` is the connected team and is currently on the Hobby plan.
- Vercel Terms of Service last updated 2026-06-01 state that Hobby may only be used for personal or non-commercial use. Therefore an upgrade to an eligible paid/commercial plan is a hard gate before paid/commercial traffic, not an open interpretation.
- API `GET /health`: 200 / healthy.
- API `GET /ready`: 503 / not ready.
- API `GET /v1/bootstrap`: 503 / blocked by the readiness gate.
- The latest API production deployment inspected is READY at the Vercel deployment layer, but application readiness remains red because `/ready` is 503.
- Web production currently redirects an unauthenticated visitor to Vercel Authentication. Source now contains an automated controlled step to disable SSO protection only for the Web project when the frontend production workflow is actually run with a valid `VERCEL_TOKEN`; the live setting has not changed yet because that workflow has not executed.
- The current Web/Admin production deployments predate the latest checked-in frontend source, including the public account-deletion, Privacy and Terms pages.
- The existing Web build log confirms the old deployment uploaded only the app subdirectory and performed its own remote `npm install`; the new controlled workflow removes that release path by building a locked prebuilt artifact in CI.
- Admin production remains intentionally protected by Vercel Authentication; the controlled workflow refuses to count 404/5xx as protection and also verifies the real Admin shell through authenticated Vercel CLI access.

A healthy `/health` alone is never sufficient to declare production ready.

## External blockers

### 1. GitHub Actions execution / dependency lock

The account reached the included Actions allowance on 2026-08-29. Current runs complete in roughly four seconds with a job record but zero executed steps. Do not interpret those runs as source failures or source success.

A current-main dependency-lock retry was triggered as `Generate Dependency Lock` run `33265834535`; it again failed before executing real steps. A later Foundation QA run `33266175612` also has a failed job with `steps: null`. No real current lock or QA execution has occurred.

Because root manifests changed after those attempts to pin Vercel/esbuild tooling, the next successful dependency-lock execution must run against the then-current `main`. The workflow checks out `main`, generates `package-lock.json`, validates it with a clean `npm ci`, commits it, then dispatches Foundation QA automatically.

Do not fabricate a lockfile or mark current HEAD green before that happens.

### 2. Production database credential

The Neon project/branch/database are known, but the connected Neon tool still has a schema mismatch: the client exposes `projectId`/`branchId`/`databaseName` while the backend rejects those keys and requires snake_case fields. Both connection-string retrieval and a read-only `SELECT 1` fail at argument validation before reaching the database.

Do not invent or reconstruct the database password. Required secure input for automated production deployment: `PRODUCTION_DATABASE_URL`.

### 3. Vercel production write credential

The controlled release can now automate the Web protection change and deploy all three Vercel projects, but it still needs a real Vercel credential stored securely as repository secret `VERCEL_TOKEN`.

Do not paste the token into chat or source.

### 4. Production Email OTP mailbox

The deployment workflow defaults to Google Workspace SMTP (`smtp.gmail.com`, port 465, TLS) and performs a real delivery/verify/session/logout E2E test.

Required secure inputs:
- `PRODUCTION_SMTP_USERNAME`
- `PRODUCTION_SMTP_PASSWORD` (Google Workspace App Password or another valid mailbox credential)

Do not fake OTP delivery in production.

### 5. Support Email

Privacy Policy, Terms of Service and Account Deletion now have first-party canonical Web URLs in source. The remaining public-release contact input is a real support mailbox:

- `PRODUCTION_SUPPORT_EMAIL`

Do not infer this from `SMTP_FROM_EMAIL` or a no-reply mailbox. Public-release readiness remains fail-closed until a valid support address exists.

### 6. Account-deletion retention decision

The self-service request and Admin queue exist, but final deletion/anonymization is intentionally not implemented yet. Before a destructive processor is added, define which financial ledger, payment/payout, safety, dispute and other open records must be retained or anonymized and for how long.

No destructive database action should be added merely to make the deletion queue disappear.

### 7. Mobile EAS project linkage and release artwork

The checked-in mobile configuration is build-profile ready but not yet EAS/store-distribution ready:

- `apps/mobile/app.json` does not currently contain `extra.eas.projectId`; do not invent an Expo project ID. EAS must be linked to the real Expo account/project before a non-interactive production EAS build.
- The mobile project currently has no checked-in production app icon/adaptive-icon artwork and `app.json` does not point to release icon assets. Do not ship a default/placeholder Expo identity as a finished store release.
- The production EAS profile already pins Node `22.23.1`, uses the canonical production API, requires a committed source state and uses remote auto-incremented native build versions.
- Android signing/store credentials and Apple signing/App Store credentials still require real external account setup and verification.

These mobile-store items do not justify opening any unready backend surface.

### 8. Vercel commercial plan before paid launch

Team `UNIQUE` is currently Hobby. Vercel Terms of Service dated 2026-06-01 explicitly restrict Hobby to personal/non-commercial use. Before any paid/commercial YEKI-HAST traffic is opened, move the workload to an eligible Vercel commercial plan and verify the resulting project state.

Caller paid flows must remain closed while this gate is red.

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

1. Run `Generate Dependency Lock` against current `main`. Require successful lock generation, `npm ci` validation and commit of the real `package-lock.json`.
2. Require the automatically dispatched Foundation QA to finish truly green on the resulting current `main`. QA itself installs from the lock before tests/builds and uses lock-installed esbuild.
3. Store only the required external credentials in secure GitHub secrets; never place credentials in source or chat.
4. Trigger the controlled Production API workflow. It must use lock-installed Vercel/esbuild binaries, verify the production DB without migrations, build from the lock and deploy only prebuilt output.
5. Require `/health` 200, `/ready` 200 with `database: "ready"` and `schema: "ready"`, and a valid `/v1/bootstrap` response.
6. Require real Email OTP delivery, verification, authenticated session and logout/revocation E2E PASS.
7. Trigger the controlled frontend workflow. It disables Vercel Authentication SSO only for project `web`, leaves `admin` protected, builds Web/Admin from the root lock and deploys only prebuilt output.
8. Require unauthenticated public PASS for `/`, `/privacy`, `/terms` and `/account/delete`.
9. Require Admin to reject unauthenticated access with a real protection response and then PASS authenticated Admin shell smoke.
10. Review Admin integration-readiness output with secrets excluded.
11. Link the real Expo/EAS project and add approved production release artwork before calling the native app store-ready; then complete real signing/build/store verification.
12. Upgrade Team `UNIQUE` from Hobby to an eligible commercial plan before opening paid traffic.
13. Define account-deletion retention/anonymization policy before implementing any destructive deletion processor.
14. Keep Caller beta closed until telephony/payment/phone/age/public-release/commercial-hosting gates are all genuinely ready.
15. Only then enable the smallest intended beta surface and monitor runtime errors.

## Non-negotiable rules

- No Codex for this project.
- Do not touch Evidence Axis.
- No DB migration without explicit user approval.
- Never guess provider behavior or provider references.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it was actually tested.
