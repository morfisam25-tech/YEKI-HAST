# Launch Status — یکی هست

Last reviewed: 2026-08-31

This file is the repository source of truth for launch state. Re-check real GitHub, Vercel, Neon and provider state before trusting older chat notes.

## Source state

- Production workflows are pinned to Vercel Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects.
- Automatic Vercel Git deployments are disabled; controlled workflows own production release.
- Release tooling uses Node `22.23.1`, the committed workspace lock and lock-installed Vercel/esbuild binaries.
- Manual API, frontend and DB-migration dispatches require exact confirmation phrases.
- API release bundles and syntax-checks runtime before Vercel production mutation.
- Root API config and controlled API artifact both use Vercel region `iad1`.
- Intended Neon production region is `aws-us-east-1`. No `aws-us-east-2` project is approved for production.
- `.launch/production-db-migration` is intentionally `blocked=pending-correct-aws-us-east-1-production-db`.
- Both production migration and API deploy fail closed until that marker is replaced by an explicitly approved `aws-us-east-1` project carrying an opaque endpoint SHA-256 fingerprint.
- Migration runs a read-only state preflight before DDL and a read-only schema/seed verifier after the exact hash-tracked repository migrations.
- API production smoke requires exact release SHA, `/ready` DB/schema readiness, Caller closed and `legal.ready === true` with exact public policy/support values.
- Technical-beta public support identity is locked to `sales@uniqueholding.com.tr`; stale secret-only overrides are rejected.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict + `__Host-` cookies. Browser mutation proxies reject cross-site/same-site requests and fail closed on missing browser metadata in production.
- Browser-proxied Email OTP uses separate `OTP_EMAIL_IP_LIMIT_PER_15M=200`; per-email/global limits remain active. Direct phone/SMS OTP retains `OTP_IP_LIMIT_PER_15M=20`.
- Account deletion immediately revokes sessions and records a pending request. No destructive processor exists until retention rules are defined. Only a pending request is treated as idempotent.
- `.vercel`, `dist-api`, `.env` and `.env.*` are ignored; `.env.example` remains committable.
- Caller closed beta, manual phone verification beta and Admin bootstrap are disabled by default. Production dev OTP and dev telephony are forbidden.
- Last fully validated source baseline `7238ab6921462095e97f25fe20e1114a02a8367a` passed 474 tests, workspace typecheck, foundation validation, Web/Admin builds and Android/iOS exports. Current `main` is ahead and needs a fresh real Foundation QA before release.

## Live infrastructure last verified

### Vercel

- Team: `UNIQUE`.
- API `/health`: healthy.
- API `/ready`: not ready because a valid migrated production DB/config is not connected.
- Real API deployment region observed: `iad1`.
- Web remains protected and not public.
- Admin remains intentionally protected.
- Current Web/Admin live deployments predate the latest checked-in source.

### Neon

- Correct production project does **not** yet exist in required `aws-us-east-1`.
- Connector accidentally created `yeki-hast-production` in `aws-us-east-2`, ID `royal-lab-98725266`.
- That Ohio project is **not production-approved and must never receive migrations or be connected to the app**.
- Latest Neon metadata showed one default branch and `written_data_bytes: 0`; no application migration was run against it.
- Cleanup was attempted, but the connector delete wrapper still fails before execution because it sends `projectId` while the backend expects `project_id`. Therefore the wrong-region project may still exist.
- The create-project connector still exposes no region parameter. Do not use it again for production creation unless explicit region selection becomes available.

### Credentials

- Never paste DB, SMTP, Vercel or provider secrets into chat/source.
- A DB credential was previously exposed outside the intended secret store. Before migration, generate/rotate the correct production credential and store it securely.
- Controlled API release requires valid `VERCEL_TOKEN`, `PRODUCTION_DATABASE_URL` and `PRODUCTION_SMTP_PASSWORD` at execution time. Verify presence then; do not infer it from old notes.

A healthy `/health` alone never means production is ready.

## Current technical-beta blockers

1. **Correct Neon project:** create fresh `yeki-hast-production` explicitly in `aws-us-east-1`; never use scratch/probe or the accidental Ohio project. Verify region and empty state read-only.
2. **Fresh Foundation QA:** exact current `main` must run on a real GitHub Actions Runner and pass. A zero-step/no-runner workflow is not a QA result.
3. **Migration approval:** after correct DB creation, secure credential rotation and green QA, obtain explicit migration permission. Only then replace the blocked marker with verified project/region/host fingerprint and run the guarded migration.
4. **Production credentials:** secure Vercel + Google Workspace SMTP execution credentials are still required. No fake provider is allowed.
5. **Real Email OTP E2E:** release must prove SMTP delivery, mailbox observation, OTP verify, session, logout and revocation.
6. **Web public cutover:** only after API readiness/E2E pass. Keep Admin protected; validate Web before cutover; make only Web public; smoke `/`, `/privacy`, `/terms`, `/account/delete` and support route; re-protect Web on failure.
7. **Operational Admin:** fresh migration does not invent an admin. Before workflows needing human review, establish a real owner/admin through guarded one-time bootstrap and immediately disable/clear bootstrap afterward.
8. **Commercial hosting:** do not spend merely for source QA. Confirm/upgrade to an eligible Vercel plan before paid/commercial traffic, only with explicit approval.

## Technical beta scope

- Email auth and account/session plumbing may open only after real production E2E PASS.
- Privacy, Terms, Account Deletion and Support may open only after frontend smoke PASS.
- Admin stays protected.
- Caller voice stays closed.
- Payment, telephony, payout, KYC and final call-phone verification remain provider-gated and are not technical-beta prerequisites.
- Native store submission is not a technical-beta prerequisite.

## Controlled sequence

1. Create correct Neon `aws-us-east-1` project and verify it is fresh.
2. Generate/rotate production DB credential and store it securely.
3. Restore/confirm GitHub Actions Runner execution; run Foundation QA on exact current `main`.
4. Review exact DB target and obtain explicit migration permission.
5. Replace blocked DB marker only with verified `aws-us-east-1` project + host fingerprint.
6. Run guarded migration; require preflight and post-migration verification PASS.
7. Add/verify secure Vercel and SMTP credentials.
8. Run controlled API deploy; require `/ready`, legal/support bootstrap and real Email OTP E2E PASS.
9. Run controlled frontend deploy; make only Web public after protected checks; keep Admin protected.
10. Keep provider-gated Caller/payment/KYC/payout flows closed.
11. Establish real application admin before operational beta.
12. Confirm commercial hosting before paid traffic.

## Non-negotiable rules

- No Codex.
- Do not touch Evidence Axis.
- No DB migration without explicit approval.
- Never use the accidental Ohio Neon project for production.
- Never guess provider behavior.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it actually ran and passed.
