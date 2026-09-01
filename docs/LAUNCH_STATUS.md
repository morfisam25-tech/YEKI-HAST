# Launch Status — یکی هست

Last reviewed: 2026-09-01

This file is the repository source of truth for current launch state. Re-check live GitHub, Vercel, Neon and provider state before trusting older chat notes.

## Current source state

- Production Vercel scope is pinned to Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects. Evidence Axis is not part of any production workflow.
- Automatic Vercel Git deployment is disabled in checked-in API/Web/Admin configuration.
- API deploy, frontend deploy and production DB migration are manual-only `workflow_dispatch` mutations with exact confirmation phrases plus `main`/repository guards.
- Release tooling is locked to Node `22.23.1`, npm `10.9.8`, the committed workspace lock and lock-installed Vercel/esbuild binaries.
- Foundation QA executes `tests/*.test.ts`; inline production-workflow JavaScript is source syntax-checked.
- API production region is `iad1`; Neon production region is `aws-us-east-1` only.
- Production migration requires a green Foundation QA ancestor, exact target/transport guard, read-only migration-state preflight, hash-tracked repository migrations and post-migration read-only verification.
- API deploy requires green Foundation QA, verified DB state, readiness/bootstrap smoke and real Email OTP delivery/verify/session/logout/revocation E2E.
- Live controlled `/ready` now requires the migration tracking relation, all critical relations, and the exact canonical SHA-256 values of both repository migrations; migration-history drift returns `503 service_not_ready`.
- Controlled API entrypoint logs generic internal events/Error names rather than raw DB/import Error objects while client responses stay sanitized.
- API release captures the previous READY production deployment and requests rollback if the new deployment succeeds but post-deploy verification fails.
- Frontend release requires Web and Admin to be protected before deployment, verifies exact protected deployments, may open only Web, keeps Admin protected, and re-protects Web if cutover verification fails.
- Web uses the normal Next.js server runtime because Email OTP/session/account-deletion proxy routes are POST Route Handlers. Static-export mode is explicitly guarded against; public pages can still be statically optimized by Next.js.
- Web browser auth proxy rejects cross-site mutations, uses a production `__Host-` HttpOnly/Secure/SameSite=Strict session cookie, never returns raw session tokens to browser JavaScript, bounds declared auth payload size and email length, and validates six-digit OTP format before forwarding.
- Technical-beta support identity is source-locked to `sales@uniqueholding.com.tr`; actual mailbox readiness is proved only by production SMTP/IMAP E2E.
- Browser-proxied Email OTP uses `OTP_EMAIL_IP_LIMIT_PER_15M=200`; direct Phone/SMS OTP retains `OTP_IP_LIMIT_PER_15M=20`; per-identity/global limits remain active.
- Email-auth startup validates encryption/pepper state, SMTP state, session/OTP TTL bounds, per-email/per-IP/global rate-limit bounds and database readiness before serving the route.
- Account deletion is request-based only: owner Email OTP verification, explicit confirmation, immediate session revocation and pending audit state. No destructive deletion/anonymization processor exists until retention rules are defined.
- Admin deletion queue is authenticated, read-only, pending-only and returns no email/phone/identity/banking payload; the UI exposes no final-delete action.
- Caller closed beta, manual phone verification beta and Admin bootstrap remain disabled by default. Production dev OTP, dev SMS and dev telephony are forbidden.
- SMS.ir production use requires explicit approved-template acknowledgement. Telephony has no implemented production adapter, so Caller cannot accidentally open through a development adapter.
- KYC inquiry and payout adapters accept only their configured real provider, use HTTPS/timeouts and strict response parsing, and do not synthesize success. Manual KYC review cannot create a verified identity.
- Payout dispatch requires verified KYC and consistent locked payout sources; ambiguous provider dispatch is not blindly retried/failed. Payout reconciliation can mark paid only after provider status reports completion, then updates ledger state transactionally.
- Production Caller also requires `COMMERCIAL_HOSTING_APPROVED=true`; on production a configured Caller flag alone is insufficient.
- `.vercel`, `dist-api`, `.env` and `.env.*` are ignored; `.env.example` remains intentionally committable.
- Last fully executed green baseline is `7238ab6921462095e97f25fe20e1114a02a8367a`: 474 tests, workspace typecheck, foundation validation, Web/Admin builds and Android/iOS exports passed. Current `main` is ahead and is **not QA-PASS** until a real Runner executes Foundation QA.

## Live infrastructure last verified

### Vercel

- Team: `UNIQUE` (`team_GmseY3ibD05FWemVhLElL3hI`), plan: `hobby`.
- API project: `prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy`; current production deployment is READY.
- API `/health`: healthy; observed execution region `iad1`.
- API `/ready`: `503 service_not_ready`, expected until the verified production DB is migrated, connected and release env is deployed.
- Web/Admin production deployments predate current checked-in source and remain protected/not cut over.
- No grouped runtime errors were reported for API, Web or Admin over the checked recent window.
- No production deployment, protection change or Vercel plan change was performed during this hardening pass.

### Neon

Current projects:

1. `weathered-bar-87205560` — `yeki-hast-production` — `aws-us-east-1` — selected production target.
2. `falling-rain-19435219` — `yeki-hast-credential-probe` — test-only; never use for production.
3. `calm-sun-22159730` — `yeki-hast-scratch` — test-only; never use for production.

The accidental Ohio production project is no longer present after manual deletion.

Selected target verification:

- Project: `weathered-bar-87205560`.
- Region: `aws-us-east-1` (N. Virginia).
- PostgreSQL: 18.
- Default branch: `production` (`br-plain-paper-aucjl3y6`).
- Database: `neondb`.
- Fresh tree: default databases, `public` schema and Neon internal `show_db_tree`; no application tables/schemas/migration table.
- `written_data_bytes=0` at fresh-state verification.
- Repository credential must use the direct/non-pooled endpoint.

### GitHub

- `main` remains unprotected on the current private-repository plan/integration path.
- Production mutation workflows are therefore manual-only and cannot be triggered by normal pushes.
- `PRODUCTION_DATABASE_URL` has been manually updated to the new direct/non-pooled N. Virginia connection string.
- Explicit migration approval has been received for project `weathered-bar-87205560` in `aws-us-east-1`.
- The source migration marker remains fail-closed (`blocked=`) because the connected write path would not safely accept the approval-marker transition. Do not weaken or bypass the exact target guard; align that source gate immediately before execution once Actions Runner is available.
- Foundation QA execution remains externally blocked at the Actions runner/billing layer. Zero-step/no-runner failures are not source failures and are not QA PASS.
- Repository Secrets cannot be read or written by the connected GitHub integration; sensitive secret changes must be done through GitHub UI.

### Credentials

- Never paste DB, SMTP, Vercel or provider secrets into chat/source.
- `PRODUCTION_DATABASE_URL` is reported updated in GitHub for the correct Virginia DB; do not expose its value.
- Controlled API release also requires valid `VERCEL_TOKEN` and `PRODUCTION_SMTP_PASSWORD` at execution time.
- Source defaults SMTP username/from/support to `sales@uniqueholding.com.tr`; production Email OTP E2E remains the proof of delivery readiness.

## Remaining blockers

### Manual/external but not GitHub-payment dependent

1. Verify/store `VERCEL_TOKEN` as a GitHub repository secret before release execution.
2. Verify/store the Google Workspace App Password as `PRODUCTION_SMTP_PASSWORD` before release execution.
3. Temporary branch `tmp-check-noop` still exists from a capability check; it never touched `main` and can be deleted manually because the current connected GitHub actions expose no delete-ref operation.

### GitHub Actions/payment dependent execution gates

1. Run Foundation QA on exact current `main` and require every step to execute and pass.
2. Align the fail-closed DB source marker to the already-approved exact Virginia target; do not change target scope or weaken exact endpoint validation.
3. Run manual guarded production migration and require preflight + post-migration verification PASS.
4. Run manual controlled API deploy and require `/ready`, bootstrap and real Email OTP E2E PASS; rollback safety is wired.
5. Run manual controlled frontend deploy; only Web may become public and Admin must stay protected.

### Separate commercial/payment gate

- Vercel Team is currently Hobby. Do not open paid/commercial traffic until an eligible commercial plan/terms are confirmed and any upgrade is explicitly approved.

## Technical beta scope

- Email auth and account/session plumbing may open only after real production E2E PASS.
- Public Privacy, Terms, Account Deletion and Support surfaces may open only after frontend smoke PASS.
- Admin stays protected.
- Caller voice stays closed.
- Payment, telephony, payout, KYC and final call-phone verification remain provider-gated and are not technical-beta prerequisites.
- Native store submission is not a technical-beta prerequisite.

## Controlled release sequence

1. Restore GitHub Actions Runner execution and run Foundation QA on exact current `main`.
2. Align the DB source marker to the already-approved project `weathered-bar-87205560` / `aws-us-east-1` target without weakening exact endpoint validation.
3. Run manual guarded migration; require preflight and post-migration verification PASS.
4. Verify secure Vercel and SMTP execution credentials.
5. Run manual controlled API deploy; require `/ready`, legal/support bootstrap and real Email OTP E2E PASS. Failed post-deploy verification must invoke rollback safety.
6. Run manual controlled frontend deploy; make only Web public after protected checks; keep Admin protected.
7. Keep provider-gated Caller/payment/KYC/payout flows closed.
8. Establish a real application admin through the guarded one-time bootstrap before operational workflows requiring human review.
9. Confirm commercial hosting eligibility before paid traffic.

## Non-negotiable rules

- No Codex.
- Do not touch Evidence Axis.
- No DB migration without explicit approval scoped to the exact target.
- Never use the test-only Neon projects for production.
- Never guess provider behavior.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it actually ran and passed.
