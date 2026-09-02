# Launch Status — یکی هست

Last reviewed: 2026-09-02

This file is the repository source of truth for current launch state. Re-check live GitHub, Vercel, Neon and provider state before trusting older chat notes.

## Current source state

- Production Vercel scope is pinned to Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects. Evidence Axis is excluded from Listener release workflows.
- Automatic Vercel Git deployment is disabled in checked-in API/Web/Admin configuration.
- API deploy, frontend deploy and production DB migration are manual-only `workflow_dispatch` mutations with exact confirmation phrases plus `main`/repository guards.
- Release tooling is locked to Node `22.23.1`, npm `10.9.8`, the committed workspace lock and lock-installed release binaries.
- API production region is `iad1`; Neon production region is `aws-us-east-1` only.
- Production DB target approval is pinned to project `weathered-bar-87205560` with an exact endpoint fingerprint and required TLS/channel binding.
- Production migration preflight and verifier compare exact migration filenames/hashes and reject unknown migration history.
- Caller beta, Payment, KYC, Payout, Telephony and production SMS selectors remain provider-gated/fail-closed.
- KYC and call-phone endpoints stop before sensitive-body collection when their production provider/beta gate is closed.
- Production browser/backend API targets remain locked to the canonical production API; unsafe localhost/http/credential-bearing overrides are rejected.
- Production email transport is source-locked to the Gmail API for `sales@uniqueholding.com.tr`, using a Google Workspace domain-wide-delegated service account. SMTP/App Password is no longer part of the production release path.
- Production Email OTP E2E sends through Gmail API and reads the delivered OTP back through delegated Gmail readonly API before session/logout/revocation checks.

## Verified GitHub gates

### Foundation QA

- Current code/workflow baseline: `5a4b63fe7eabc05fa9a1ca219cc3d0d7039bde88`.
- Foundation QA run `#882` / Actions run `33578910668`: **SUCCESS**.
- Foundation tests: `524/524` PASS.
- Foundation invariant validator: PASS.
- Gmail-API production security verifier: PASS.
- Workspace typecheck: PASS.
- Web production build: PASS.
- Admin production build: PASS.
- Android export: PASS.
- iOS export: PASS.
- Production API bundle/artifact: PASS.
- Later changes to this status file are metadata-only and are permitted by the QA lineage guard; code/workflow changes still require fresh QA.

### Production DB migration

- Production migration run `#5` / Actions run `33572791927`: **SUCCESS**.
- Exact Virginia destination guard: PASS.
- Read-only migration preflight: `2 known migration(s)` PASS.
- `0001_initial.sql`: already applied; migration runner reported `skip`.
- `0002_email_auth.sql`: already applied; migration runner reported `skip`.
- Post-migration read-only production verifier: **PASS**.
- The earlier migration attempts that exposed verifier/preflight `regclass` display-name assumptions did not justify weakening any target/history guard; both checks were corrected and re-covered by Foundation QA before run #5.

## Live infrastructure last verified

### Neon

- Production project: `weathered-bar-87205560` — `yeki-hast-production`.
- Region: `aws-us-east-1` (N. Virginia).
- Default branch: `production` (`br-plain-paper-aucjl3y6`).
- Database: `neondb`.
- Production application schema and both official repository migration records are now present and verified by the guarded GitHub workflow.
- `falling-rain-19435219` (`yeki-hast-credential-probe`) and `calm-sun-22159730` (`yeki-hast-scratch`) remain test-only and must never be used for production.

### Vercel

- Team: `UNIQUE` (`team_GmseY3ibD05FWemVhLElL3hI`).
- API project: `prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy` (`yeki-hast`).
- Canonical API domain remains `https://yeki-hast-theta.vercel.app`.
- Latest observed API production deployment is READY (`dpl_BmKu2scQHZNCTHptgSs4cc4zXWmA`) but predates the current verified release source/database cutover.
- No new Listener production API/Web/Admin deployment has been performed after DB verification.
- No Vercel plan purchase or upgrade has been authorized.

### Gmail mailbox preflight

- The connected `sales@uniqueholding.com.tr` mailbox was verified directly.
- A self-addressed preflight message sent from the mailbox to itself was returned with both `SENT` and `INBOX`, confirming the release smoke test's same-mailbox delivery/readback assumption. The temporary test message was then moved to Trash.
- This mailbox preflight does not substitute for the production domain-wide-delegated service-account OAuth test; that remains part of the guarded production API deploy.

### GitHub secrets / credentials

- `PRODUCTION_DATABASE_URL` is present as a Repository Secret and has passed the exact production target guard during migration run #5.
- `VERCEL_TOKEN` was manually confirmed present in the Repository Secrets UI after creation for the `UNIQUE` deployment scope. Its operational validity will still be checked by the guarded API deployment before any Vercel mutation proceeds.
- The old SMTP/App Password secret is no longer required.
- The remaining mail credential is `PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON`. It must be the real Google service-account JSON whose numeric OAuth client ID has been granted Workspace domain-wide delegation for the exact Gmail scopes used by this release.
- Never paste DB, Vercel, Google private-key, provider, OTP or session secrets into chat/source.

## Remaining blocker

### Required before controlled API deployment

1. Complete the Google Workspace Gmail API machine-auth setup:
   - Gmail API enabled for the Google Cloud project that owns the service account.
   - Service account created with domain-wide delegation enabled.
   - Its OAuth client ID authorized in Google Workspace Admin for `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly`.
   - Repository Secret `PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON` set to the downloaded service-account JSON. The checked-in release code fixes the impersonated/from identity to `sales@uniqueholding.com.tr`.
2. Run the manual controlled API deploy from exact authorized `main` and require all of these to pass:
   - Foundation QA lineage attestation.
   - Read-only production DB verification.
   - Vercel token/team/project authorization guard.
   - Production API deployment to the exact `UNIQUE` project.
   - `/health` PASS.
   - `/ready` PASS.
   - `/v1/bootstrap` expected safe behavior.
   - Real Gmail API Email OTP delivery/readback, verification, session, logout and revocation E2E.
3. Only after the API gate is green, run the guarded frontend deployment. Web may become public only after its smoke checks; Admin must remain protected.

### Intentionally closed for technical beta

- Caller voice.
- Payment/top-up.
- KYC.
- Payout.
- Telephony.
- Production SMS/phone OTP until a real approved provider/template gate is satisfied.
- Native store launch credentials/artwork/signing are separate from backend/web technical beta.

### Separate commercial gate

- Do not open paid/commercial traffic or buy/upgrade a Vercel plan without explicit approval.

## Controlled release sequence

1. Foundation QA — **PASS** on `5a4b63fe7eabc05fa9a1ca219cc3d0d7039bde88` in run `33578910668`.
2. Exact production DB target approval — **PASS**.
3. Production DB migration + read-only verification — **PASS** in run `33572791927`.
4. Vercel Repository Secret — **PRESENT; operational validation pending guarded deploy**.
5. Delegated Gmail service-account credential — **BLOCKED on manual Google Cloud / Workspace setup**.
6. Controlled API deploy + health/readiness/bootstrap/Email OTP E2E — pending step 5.
7. Controlled frontend deploy; Web public only after smoke, Admin protected — pending API PASS.
8. Keep provider-gated Caller/Payment/KYC/Payout/Telephony/SMS flows closed.
9. Confirm commercial hosting eligibility before paid traffic.

## Non-negotiable rules

- Do not touch Evidence Axis.
- No production mutation outside the guarded exact Listener targets.
- Never use test-only Neon projects for production.
- Never guess provider behavior.
- Never expose secrets, private identity data, banking data or OTP/session material.
- Production stays fail-closed.
- Never mark a launch gate green unless it actually ran and passed.
