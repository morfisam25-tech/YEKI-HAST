# Launch Status — یکی هست

Last reviewed: 2026-09-01

This file is the repository source of truth for current launch state. Re-check live GitHub, Vercel, Neon and provider state before trusting older chat notes.

## Current source state

- Production Vercel scope is pinned to Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects. Evidence Axis is not part of any production workflow.
- Automatic Vercel Git deployment is disabled in checked-in API/Web/Admin configuration.
- API deploy, frontend deploy and production DB migration are **manual-only** `workflow_dispatch` mutations with exact confirmation phrases and `main`/repository guards.
- Release tooling is locked to Node `22.23.1`, npm `10.9.8`, the committed workspace lock and lock-installed Vercel/esbuild binaries.
- Foundation QA executes `tests/*.test.ts`; inline production-workflow JavaScript is source syntax-checked.
- API production region is `iad1`; the approved Neon production region is `aws-us-east-1` only.
- The exact selected production DB target is now recorded in `.launch/production-db-migration`, but the marker remains `blocked=` until the repository credential is updated and this exact target receives explicit migration approval.
- Selected target metadata: project `weathered-bar-87205560`, region `aws-us-east-1`, branch `production`, database `neondb`. The endpoint is pinned only by opaque SHA-256 in source; credentials/hostname are not committed.
- Production migration requires a green Foundation QA ancestor, exact target/transport guard, read-only migration-state preflight, hash-tracked repository migrations and post-migration read-only verification.
- API deploy requires green Foundation QA, exact approved DB target, production DB verification, readiness/bootstrap smoke and real Email OTP delivery/verify/session/logout/revocation E2E.
- API release captures the previous READY production deployment and requests rollback if the new deployment succeeds but post-deploy verification fails.
- Frontend release requires Web and Admin to be protected before deployment, verifies exact protected deployments, may open only Web, keeps Admin protected, and re-protects Web if cutover verification fails.
- Technical-beta public support identity is source-locked to `sales@uniqueholding.com.tr`; source selection is not considered mailbox proof until production SMTP/IMAP E2E passes.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict + `__Host-` cookies. Browser mutation proxies fail closed on invalid/missing production browser metadata.
- Browser-proxied Email OTP uses `OTP_EMAIL_IP_LIMIT_PER_15M=200`; direct Phone/SMS OTP retains `OTP_IP_LIMIT_PER_15M=20`; per-identity/global limits remain active.
- Account deletion is request-based only: owner Email OTP verification, explicit confirmation, immediate session revocation and pending audit state. No destructive deletion/anonymization processor exists until retention rules are defined.
- Admin deletion queue is authenticated, read-only, pending-only and returns no email/phone/identity/banking payload; the UI exposes no final-delete action.
- Caller closed beta, manual phone verification beta and Admin bootstrap remain disabled by default. Production dev OTP and dev telephony are forbidden.
- `.vercel`, `dist-api`, `.env` and `.env.*` are ignored; `.env.example` remains intentionally committable.
- Last fully executed green baseline is `7238ab6921462095e97f25fe20e1114a02a8367a`: 474 tests, workspace typecheck, foundation validation, Web/Admin builds and Android/iOS exports passed. Current `main` is ahead and is **not QA-PASS** until a real Runner executes Foundation QA.

## Live infrastructure last verified

### Vercel

- Team: `UNIQUE` (`team_GmseY3ibD05FWemVhLElL3hI`), plan: `hobby`.
- API project: `prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy`; current production deployment is READY.
- API `GET /health`: healthy; observed execution region `iad1`.
- API `GET /ready`: `503 service_not_ready`, expected until the verified production DB is migrated, connected and release env is deployed.
- Web project `prj_afhSiMYpsCfIAxuOmotLAWBvTMDg` and Admin project `prj_l18v3f003ORfiN6hKxYwJbvVPzzC` still run older production deployments that predate current source.
- No grouped runtime errors were reported for API, Web or Admin over the checked recent window.
- No production deployment, protection change or plan change was performed during this hardening pass.

### Neon

Current organization projects were re-listed after manual cleanup/creation:

1. `weathered-bar-87205560` — `yeki-hast-production` — **`aws-us-east-1`** — selected production target.
2. `falling-rain-19435219` — `yeki-hast-credential-probe` — `aws-us-east-1` — test-only; never use for production.
3. `calm-sun-22159730` — `yeki-hast-scratch` — `aws-us-east-1` — test-only; never use for production.

The accidental Ohio production project `royal-lab-98725266` is no longer present after manual deletion.

Selected production target verification:

- Project ID: `weathered-bar-87205560`.
- Region: `aws-us-east-1` (N. Virginia).
- PostgreSQL: 18.
- Default branch: `production` (`br-plain-paper-aucjl3y6`).
- Database tree is fresh: only default databases, `public` schema and Neon internal `show_db_tree`; no application tables/schemas/migration table.
- `written_data_bytes=0`, compute usage 0 at verification time.
- Connection pooling must remain OFF for the migration/release repository credential.
- Exact direct endpoint fingerprint is recorded in the blocked source marker; the credential itself must exist only in GitHub Secret `PRODUCTION_DATABASE_URL`.

### GitHub

- `main` remains unprotected on the current private-repository plan/integration path.
- Production mutation workflows are therefore manual-only and cannot be triggered by normal pushes.
- Foundation QA execution remains externally blocked at the Actions runner/billing layer. Zero-step/no-runner failures are not source failures and are not QA PASS.
- Repository Secrets cannot be read or written by the connected GitHub integration; sensitive secret updates must be done through GitHub UI.

### Credentials

- Never paste DB, SMTP, Vercel or provider secrets into chat/source.
- The old Ohio `PRODUCTION_DATABASE_URL` must be replaced with a fresh **direct/non-pooled** connection string for project `weathered-bar-87205560`, branch `production`, database `neondb`.
- Controlled API release also requires valid `VERCEL_TOKEN` and `PRODUCTION_SMTP_PASSWORD` at execution time.
- Source defaults SMTP username/from/support to `sales@uniqueholding.com.tr`; production Email OTP E2E remains the proof of delivery readiness.

A healthy `/health` alone never means production is ready.

## Remaining blockers

### Manual/external but not GitHub-payment dependent

1. Update GitHub repository secret `PRODUCTION_DATABASE_URL` with the fresh direct/non-pooled connection string for project `weathered-bar-87205560`; do not disclose it in chat/source.
2. Confirm `VERCEL_TOKEN` and Google Workspace App Password secret `PRODUCTION_SMTP_PASSWORD` exist securely before release execution.
3. Obtain explicit migration approval scoped to the exact selected production target after the DB Secret is updated. Only then convert the blocked marker to the `approved=...;project=...;region=aws-us-east-1;host_sha256=...` form.
4. A temporary GitHub branch named `tmp-check-noop` may still exist from a capability check; it never touched `main` and may be deleted manually when convenient.

### GitHub Actions/payment dependent execution gates

1. A real Foundation QA run must execute on current `main` and pass; zero-step runs do not count.
2. After secret update + exact target approval + green QA: run the manual guarded production migration and require preflight/post-verification PASS.
3. Run the manual controlled API deploy and require `/ready`, bootstrap and real Email OTP E2E PASS; rollback safety is wired.
4. Run the manual controlled frontend deploy; only Web may become public and Admin must stay protected.

### Separate commercial/payment gate

- Current Vercel Team plan is Hobby. Do not open paid/commercial traffic until an eligible commercial plan/terms are confirmed and any upgrade is explicitly approved.

## Technical beta scope

- Email auth and account/session plumbing may open only after real production E2E PASS.
- Public Privacy, Terms, Account Deletion and Support surfaces may open only after frontend smoke PASS.
- Admin stays protected.
- Caller voice stays closed.
- Payment, telephony, payout, KYC and final call-phone verification remain provider-gated and are not technical-beta prerequisites.
- Native store submission is not a technical-beta prerequisite.

## Controlled release sequence

1. Update `PRODUCTION_DATABASE_URL` to the selected direct/non-pooled N. Virginia production endpoint.
2. Restore real GitHub Actions Runner execution and run Foundation QA on exact current `main`.
3. Review exact DB target and obtain migration approval scoped to `weathered-bar-87205560`.
4. Convert the blocked DB marker to approved form with the already recorded host fingerprint.
5. Run manual guarded migration; require preflight and post-migration verification PASS.
6. Verify secure Vercel and SMTP execution credentials.
7. Run manual controlled API deploy; require `/ready`, legal/support bootstrap and real Email OTP E2E PASS. Failed post-deploy verification must invoke rollback safety.
8. Run manual controlled frontend deploy; make only Web public after protected checks; keep Admin protected.
9. Keep provider-gated Caller/payment/KYC/payout flows closed.
10. Establish a real application admin through the guarded one-time bootstrap before operational workflows requiring human review.
11. Confirm commercial hosting eligibility before paid traffic.

## Non-negotiable rules

- No Codex.
- Do not touch Evidence Axis.
- No DB migration without explicit approval scoped to the exact target.
- Never use the test-only Neon projects for production.
- Never guess provider behavior.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it actually ran and passed.
