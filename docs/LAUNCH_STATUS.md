# Launch Status — یکی هست

Last reviewed: 2026-08-31

This file is the current launch-state source of truth. Verify live systems before relying on older chat summaries.

## Intended first release scope

The first release is a **Web/API technical beta**, not the full paid voice product.

In scope for this beta:
- public Web landing page;
- Email OTP login/session/logout;
- listener application/training foundations that are genuinely enabled by production bootstrap;
- public Privacy, Terms, Account Deletion and Support surfaces;
- protected Admin shell and operational readiness views.

Explicitly out of scope until their own external gates are complete:
- Caller voice calls;
- paid Caller flows;
- telephony provider behavior;
- call-phone verification;
- production KYC completion;
- listener payouts;
- native App Store / Play Store release;
- destructive final account deletion/anonymization.

Those out-of-scope surfaces must remain closed/fail-closed. Their incompleteness does not make the narrower Web/API technical beta dishonest, but they must never be described as active.

## Current source state

- Production Vercel team is pinned to `UNIQUE` and exact API/Web/Admin projects.
- Automatic Vercel Git deployment is disabled; controlled GitHub Actions workflows are the production path.
- Release tooling is pinned to Node `22.23.1`, npm `10.9.8`, Vercel CLI `59.3.0` and esbuild `0.25.9` through the committed workspace lock.
- Public Web source contains `/`, `/privacy`, `/terms` and `/account/delete`.
- Public Home now states explicitly that voice calling is not open yet and that no development/test route substitutes for the missing real provider gates.
- `sales@uniqueholding.com.tr` was verified through real Google Workspace mail history as a bidirectional mailbox. It is now the default production SMTP username/from address and public Support Email, while explicit overrides remain supported.
- Public Home, Privacy and Terms expose `mailto:sales@uniqueholding.com.tr`.
- Production Email OTP E2E still requires a real mailbox App Password; no fake production OTP is permitted.
- Account deletion remains request-based and fail-closed: ownership is verified, a pending request is recorded, active sessions are revoked, and the product does not claim destructive deletion has completed.
- Caller closed beta, manual phone verification beta and Admin bootstrap are disabled by default. Production dev OTP and dev telephony are forbidden.
- Mobile EAS preview and production profiles both target the canonical API `https://yeki-hast-theta.vercel.app` with Node `22.23.1`; native store artwork/signing remain separate post-beta gates.

## Production database

Production Neon project:
- project: `yeki-hast-production`
- project ID: `royal-lab-98725266`
- region: `aws-us-east-2` (Ohio)
- PostgreSQL: 18
- default branch: `main` (`br-cool-dawn-axzdy02h`)
- database: `neondb`

The production DB was verified as fresh before migration. Latest Neon metadata on 2026-08-31 still reported `written_data_bytes: 0`; no application migration has successfully executed yet.

The connected Neon SQL/Migration MCP path has a client/backend schema mismatch (`projectId` versus backend `project_id`) and fails before SQL reaches the database. Do not keep retrying that broken write path.

The approved migration path is therefore the guarded GitHub workflow `.github/workflows/migrate-production-db.yml`, which:
- accepts only `main` in this repository;
- consumes only repository secret `PRODUCTION_DATABASE_URL`;
- checks the approved Neon `us-east-2` host and `/neondb` database without printing credentials;
- installs from the committed lock;
- runs the repository migration runner (`0001_initial.sql`, then `0002_email_auth.sql`);
- runs `scripts/verify-production-db.mjs` read-only after migration.

Migration approval marker is committed at `.launch/production-db-migration` for project `royal-lab-98725266` / `aws-us-east-2`. The user explicitly authorized this migration. `PRODUCTION_DATABASE_URL` is now present as a GitHub Repository Actions secret; its value must remain hidden.

Migration hashes expected by the verifier:
- `0001_initial.sql`: `f3a6d566b8298c6ef00b10ab1efe91a313e307101297fa35d817270335ed2e09`
- `0002_email_auth.sql`: `3e748e17f9a51ce27513cf03a459e7152ac74b63af32e43ff3478c514584fd90`

The migration workflow has not executed because GitHub Actions currently cannot acquire a runner.

## Region alignment

Neon is in AWS `us-east-2`. The controlled API release now generates Vercel config with `regions: ["cle1"]` so the next API production deployment is aligned with the Ohio database rather than inheriting the old `iad1` placement.

The currently live API deployment predates this change and remains the old deployment until controlled release succeeds.

## Live state last verified 2026-08-31

- API `/health`: **200**.
- API `/ready`: **503 `service_not_ready`**, expected until migrated DB + production env are deployed.
- No API production error/fatal runtime logs were found in the last one-hour Hobby retention window during the check.
- Public Web canonical URL still redirects to Vercel Authentication (302); the current live deployment is old and predates the latest public/legal/support source.
- Admin canonical URL still redirects to Vercel Authentication (302), which is the intended protection state.
- Team `UNIQUE` remains on Vercel Hobby. No paid/commercial traffic may be opened until an eligible commercial plan is explicitly approved and purchased.

## GitHub Actions blocker

Actions still fails before source execution: jobs show zero steps / no assigned runner. Account billing showed an Actions budget of `$0` with Stop Usage enabled, and GitHub requires a valid payment method before raising that budget.

The user authorized a maximum Actions budget of **$5/month with Stop Usage enabled**. Payment-method verification is currently blocked because the bank verification SMS is not arriving. Do not exceed that authorization and do not change unrelated Codespaces/Packages/LFS/AI budgets.

Until payment is fixed:
- do not call zero-step Actions failures source failures;
- do not mark current HEAD QA-green;
- do not claim the production DB migration ran.

## Remaining irreducible secure inputs for the Web/API beta

Already configured:
- `PRODUCTION_DATABASE_URL` — repository Actions secret exists.

Still required before controlled API release:
- `VERCEL_TOKEN` — repository secret; never paste into chat/source.
- `PRODUCTION_SMTP_PASSWORD` — Google Workspace App Password (or equivalent valid mailbox credential) for the verified default mailbox; never paste into chat/source.

No separate `PRODUCTION_SMTP_USERNAME` or `PRODUCTION_SUPPORT_EMAIL` is required for the default path anymore; both default to the verified `sales@uniqueholding.com.tr` mailbox. Privacy, Terms and Account Deletion URLs also have first-party defaults.

## Controlled completion sequence after GitHub billing is fixed

1. Run Foundation QA on the exact current `main`; require real runner steps and a full PASS.
2. Run the guarded production DB migration workflow and require its post-migration read-only verifier to PASS.
3. Re-run Foundation QA if source changed after the green run; production deployment requires QA coverage for the exact release SHA.
4. Securely add `VERCEL_TOKEN` and `PRODUCTION_SMTP_PASSWORD` as repository Actions secrets if they are not already present.
5. Run controlled Production API workflow.
6. Require `/health` 200, `/ready` 200 with DB/schema ready, valid `/v1/bootstrap`, and real Email OTP delivery + verify + session + logout E2E PASS.
7. Run controlled frontend workflow: make only Web public, keep Admin protected, deploy current source.
8. Require unauthenticated public PASS for `/`, `/privacy`, `/terms`, `/account/delete` and authenticated Admin shell PASS.
9. Treat this as a technical beta only. Keep Caller/payment/KYC/payout/store-release surfaces closed until each real external gate is independently verified.
10. Before any commercial/paid traffic, separately approve and move Vercel off Hobby to a commercial-eligible plan.

## Non-negotiable rules

- No Codex/Work/Codespaces for this project.
- Do not touch Evidence Axis.
- No provider semantics may be guessed.
- Never expose secrets, bank details, private identity data, OTPs or session material.
- Production must fail closed.
- Never mark a gate green unless it was actually tested.
