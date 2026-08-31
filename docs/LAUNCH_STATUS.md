# Launch Status — یکی هست

Last reviewed: 2026-08-31

This file is the repository source of truth for launch state. Re-check real GitHub, Vercel, Neon and provider state before trusting older chat notes.

## Current source state

- Production Vercel scope is pinned to Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin project IDs. Evidence Axis is not part of any production workflow.
- Automatic Vercel Git deployment is disabled in checked-in API/Web/Admin configuration.
- **All production mutation workflows are manual-only**: API deploy, frontend deploy and production DB migration expose only `workflow_dispatch`, require an exact confirmation phrase, require `main`, and reject any other event/ref.
- This manual-only policy is intentional because repository rulesets/branch protection are not available through the current private-repository plan/integration path. Production mutation must not depend on a push marker.
- Release tooling is locked to Node `22.23.1`, npm `10.9.8`, the committed workspace lock and lock-installed Vercel/esbuild binaries. Privileged workflows disable setup-node package-manager caching.
- Foundation QA runs every `tests/*.test.ts`; production workflow inline JavaScript heredocs are syntax-checked by source tests.
- Current API/root production region is `iad1`. Controlled API and QA artifacts are guarded for region/packaging parity.
- Intended Neon production region is **`aws-us-east-1` only**. No `aws-us-east-2` project is production-approved.
- `.launch/production-db-migration` is intentionally `blocked=pending-correct-aws-us-east-1-production-db`.
- Production migration and API deploy both fail closed until that marker is replaced with an explicitly verified `aws-us-east-1` project plus opaque endpoint SHA-256 fingerprint. The credential itself is never committed or logged.
- Production migration requires a successful Foundation QA ancestor before DDL, then runs the read-only migration-state preflight, exact hash-tracked repository migrations, and post-migration read-only schema/seed verification.
- API deploy requires successful Foundation QA, the exact approved DB target, read-only production DB verification, exact release SHA, `/ready` database/schema readiness, Caller closed, legal/support readiness, and real Email OTP delivery/verify/session/logout/revocation E2E.
- Before API production mutation, the workflow captures the current READY production deployment. If the new deployment succeeds but post-deploy readiness or Email E2E fails, it requests a Vercel rollback to that previous production deployment.
- Frontend release requires Web and Admin to already be protected before any new frontend deployment. It verifies exact protected deployments first, may open only Web, keeps Admin protected, and requests Web re-protection if public cutover verification fails.
- Technical-beta public support identity is source-locked to `sales@uniqueholding.com.tr`; source selection is not considered mailbox proof until production SMTP/IMAP E2E passes.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict + `__Host-` cookies. Browser mutation proxies reject cross-site/same-site requests and fail closed on missing production browser metadata.
- Browser-proxied Email OTP uses `OTP_EMAIL_IP_LIMIT_PER_15M=200`; direct Phone/SMS OTP retains `OTP_IP_LIMIT_PER_15M=20`; per-identity/global limits remain active.
- Account deletion is request-based only: owner Email OTP verification, explicit confirmation, immediate session revocation and pending audit state. No destructive deletion/anonymization processor exists until retention rules are defined.
- Admin deletion queue is authenticated, read-only, pending-only and returns no email/phone/identity/banking payload; the UI exposes no final-delete action.
- Caller closed beta, manual phone verification beta and Admin bootstrap remain disabled by default. Production dev OTP and dev telephony are forbidden.
- `.vercel`, `dist-api`, `.env` and `.env.*` are ignored; `.env.example` remains intentionally committable.
- Last fully executed green baseline is `7238ab6921462095e97f25fe20e1114a02a8367a`: 474 tests, workspace typecheck, foundation validation, Web/Admin builds and Android/iOS exports passed. Current `main` is ahead and **is not QA-PASS until a real Runner executes Foundation QA**.

## Live infrastructure last verified

### Vercel

- Team: `UNIQUE` (`team_GmseY3ibD05FWemVhLElL3hI`), plan: `hobby`.
- API project: `prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy`; current production deployment is READY.
- API `GET /health`: 200, healthy; observed Vercel execution region `iad1`.
- API `GET /ready`: 503 `service_not_ready`, expected while a verified migrated production DB is not connected.
- Web project `prj_afhSiMYpsCfIAxuOmotLAWBvTMDg` and Admin project `prj_l18v3f003ORfiN6hKxYwJbvVPzzC` have READY production deployments that predate current checked-in source.
- Authenticated Vercel inspection confirms the live Web still serves older pre-hardening copy; therefore current source has not been cut over.
- No grouped runtime errors were reported for API, Web or Admin over the checked seven-day window.
- No production deployment, protection change or plan change was performed during this source-hardening pass.

### Neon

Current organization projects were re-listed and are exactly:

1. `royal-lab-98725266` — `yeki-hast-production` — **`aws-us-east-2`** — accidental wrong-region project; never production-approved.
2. `falling-rain-19435219` — `yeki-hast-credential-probe` — `aws-us-east-1` — test-only; never use for production.
3. `calm-sun-22159730` — `yeki-hast-scratch` — `aws-us-east-1` — test-only; never use for production.

- A fresh correct production project in `aws-us-east-1` **does not yet exist**.
- Latest checked metadata for the accidental Ohio project previously showed one default branch and `written_data_bytes: 0`; no application migration was executed against it.
- Deletion of the accidental project was attempted again but did not execute: the connector wrapper sends `projectId` while the backend validator expects `project_id`.
- The connected `create_project` action still exposes no region parameter. It must not be used again for production creation because exact region selection is mandatory.

### GitHub

- `main` is currently unprotected according to branch metadata.
- Repository rulesets returned a plan gate for this private repository; no paid upgrade was made.
- Production mutation workflows were therefore hardened to manual-only dispatch with exact phrases instead of relying on push-triggered markers.
- Foundation QA execution remains externally blocked at the Actions runner/billing layer. Zero-step/no-runner failures are not source failures and are not QA PASS.
- No Actions rerun was performed in this non-payment work pass.

### Credentials

- Never paste DB, SMTP, Vercel or provider secrets into chat/source.
- A previously exposed DB credential must not be reused. The eventual correct production DB needs a newly generated/rotated credential stored only in the secure repository secret path.
- Controlled API release requires valid `VERCEL_TOKEN`, correct `PRODUCTION_DATABASE_URL` and `PRODUCTION_SMTP_PASSWORD` at execution time. Presence/readiness must be verified then; old chat state is not proof.

A healthy `/health` alone never means production is ready.

## Remaining blockers after non-payment source work

### Manual/external but not GitHub-payment dependent

1. **Create the real Neon production project manually** in Neon Console, explicitly selecting AWS `us-east-1`. Do not use either test project or the accidental Ohio project. After creation, verify project ID, region, fresh state and endpoint before changing the blocked marker.
2. **Create/rotate the correct production DB credential** for that new project and store the connection string securely as `PRODUCTION_DATABASE_URL`; never paste it into chat/source.
3. **Ensure production execution credentials exist securely**: `VERCEL_TOKEN` and the Google Workspace App Password used as `PRODUCTION_SMTP_PASSWORD`. Values must not be disclosed in chat.
4. The accidental `aws-us-east-2` Neon project remains harmless but should be deleted from Neon Console when convenient because the connector delete wrapper is broken.
5. A temporary GitHub branch named `tmp-check-noop` was created only during a capability check and never touched `main`; it may be deleted manually because the connected GitHub actions expose no delete-ref operation.

### GitHub Actions/payment dependent execution gates

1. A real Foundation QA run must execute on current `main` and pass; zero-step runs do not count.
2. Only after correct DB target approval + green QA: run the manual guarded production migration and require preflight/post-verification PASS.
3. Then run the manual controlled API deploy and require readiness/bootstrap + real Email OTP E2E PASS; rollback safety is already wired.
4. Then run the manual controlled frontend deploy; only Web may become public and Admin must stay protected.

### Separate commercial/payment gate

- Current Vercel Team plan is Hobby. Do not open paid/commercial traffic until an eligible commercial plan/terms are confirmed. No Vercel upgrade was purchased in this pass.

## Technical beta scope

- Email auth and account/session plumbing may open only after real production E2E PASS.
- Public Privacy, Terms, Account Deletion and Support surfaces may open only after frontend smoke PASS.
- Admin stays protected.
- Caller voice stays closed.
- Payment, telephony, payout, KYC and final call-phone verification remain provider-gated and are not technical-beta prerequisites.
- Native store submission is not a technical-beta prerequisite.

## Controlled release sequence

1. Create and verify the fresh Neon `aws-us-east-1` production project.
2. Generate/rotate and securely store the new production DB credential.
3. Restore real GitHub Actions Runner execution and run Foundation QA on exact current `main`.
4. Review exact DB target and keep explicit migration approval scoped to that target.
5. Replace the blocked DB marker only with verified project/region/host fingerprint.
6. Run manual guarded migration; require preflight and post-migration verification PASS.
7. Verify secure Vercel and SMTP execution credentials.
8. Run manual controlled API deploy; require `/ready`, legal/support bootstrap and real Email OTP E2E PASS. Failed post-deploy verification must invoke rollback safety.
9. Run manual controlled frontend deploy; make only Web public after protected checks; keep Admin protected.
10. Keep provider-gated Caller/payment/KYC/payout flows closed.
11. Establish a real application admin through the guarded one-time bootstrap before operational workflows requiring human review.
12. Confirm commercial hosting eligibility before paid traffic.

## Non-negotiable rules

- No Codex.
- Do not touch Evidence Axis.
- No DB migration without explicit approval scoped to the exact target.
- Never use the accidental Ohio Neon project or the test-only Neon projects for production.
- Never guess provider behavior.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it actually ran and passed.
