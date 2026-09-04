# Launch Status — یکی هست

Last reviewed: 2026-09-03

This file is the repository source of truth for current launch state. Re-check live GitHub, Vercel, Neon and provider state before trusting older chat notes.

## Executive status

**Technical Beta production release: PASS for the currently opened scope.**

The production database, API, Gmail Email OTP path, public Web and protected Admin have all passed their guarded production gates. There is no known code/runtime blocker remaining for the current Email-first Technical Beta scope.

This does **not** mean full commercial launch, Caller voice, payments, KYC, payouts, telephony, production phone/SMS OTP or native app-store release are open. Those capabilities remain intentionally fail-closed behind their own external/provider/commercial gates.

## Current source and QA

- Current `main`: `9b7629915a8d753e70e97973e3ff035c86823171`.
- Foundation QA run `#927` / Actions run `33818814010`: **SUCCESS**.
- The full QA gate passed: dependency lock validation, runtime syntax, Foundation tests, invariant validator, Email-first production security verifier, workspace typecheck, Web build, Admin build, Android export, iOS export, API bundle and artifact upload.
- Production Vercel scope remains pinned to Team `UNIQUE` only. Evidence Axis is excluded from Listener release workflows.
- Automatic Vercel Git deployment remains disabled; production mutations are guarded manual workflows.
- Release tooling remains locked to Node `22.23.1`, npm `10.9.8` and the committed dependency lock.

## Production database — PASS

- Production project: `weathered-bar-87205560` — `yeki-hast-production`.
- Region: `aws-us-east-1` (N. Virginia).
- Default branch: `production` (`br-plain-paper-aucjl3y6`).
- Database: `neondb`.
- Production migration run `#5` / Actions run `33572791927`: **SUCCESS**.
- Exact target guard, migration-history verification and post-migration read-only verifier: **PASS**.
- Official repository migrations `0001_initial.sql` and `0002_email_auth.sql` are present in production history.
- Test-only Neon projects must never be used for production.

## Production API — PASS

- Vercel team: `UNIQUE` (`team_GmseY3ibD05FWemVhLElL3hI`).
- API project: `prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy`.
- Canonical API: `https://yeki-hast-unique-6ff0.vercel.app`.
- Proven production source: `bfc820a17567aaed7df793ad3121794dc59cd8d7c`.
- Proven production deployment: `dpl_8Tez3zqFLJcnjgzvpgxU6Z9LZ3YB` — READY.
- Controlled API deploy run `#8` / Actions run `33673505914`: **SUCCESS**.
- Production DB verification: PASS.
- `/health`: PASS.
- `/ready`: PASS.
- `/v1/bootstrap`: expected safe behavior PASS.
- Real Email OTP E2E through Gmail API: PASS, including delivery/readback, verification, authenticated session, logout and revocation checks.

## Google Workspace / Gmail production auth — PASS

- Gmail API is enabled for the production Google Cloud project.
- Service account: `yeki-hast-production-mail@yeki-hast-production.iam.gserviceaccount.com`.
- Workspace domain-wide delegation is configured.
- OAuth client ID: `116733941915896907799`.
- Authorized scopes are exactly:
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.readonly`
- Repository Secret `PRODUCTION_GMAIL_SERVICE_ACCOUNT_JSON` is installed.
- Production sender/impersonated identity remains `sales@uniqueholding.com.tr` with sender name `یکی هست`.
- SMTP/App Password is not part of the production release path.

## Production Web/Admin — PASS

Frontend application source was built from release source `39b3e58a352db6b61338739b4d20f19c2006f125`. Later `main` changes through `9b762991...` changed only release verification workflow/test metadata for this frontend cutover; the verifier explicitly confirmed frontend/runtime source equivalence before promotion.

### Web

- Project: `prj_afhSiMYpsCfIAxuOmotLAWBvTMDg`.
- Canonical: `https://web-unique-6ff0.vercel.app`.
- Exact verified V4 deployment: `https://web-gax4jiw5k-unique-6ff0.vercel.app`.
- Exact deployment identity/READY: PASS.
- Protected pre-promotion authenticated smoke: PASS.
- Promoted to public production: PASS.
- Public canonical smoke: PASS for:
  - `/`
  - `/privacy`
  - `/terms`
  - `/account/delete`

### Admin

- Project: `prj_l18v3f003ORfiN6hKxYwJbvVPzzC`.
- Canonical: `https://admin-unique-6ff0.vercel.app`.
- Exact verified V4 deployment: `https://admin-4xoi0aw5d-unique-6ff0.vercel.app`.
- Exact deployment identity/READY: PASS.
- Authenticated Admin SSR smoke: PASS.
- Promoted: PASS.
- Canonical Admin protection after promotion: PASS.

### Final frontend verification

- Workflow: `Verify and Promote V4 Frontends`.
- Run `#2` / Actions run `33820757590`: **SUCCESS**.
- Both exact staged URLs were confirmed protected before authenticated smoke.
- Admin smoke: PASS.
- Web smoke: PASS.
- Admin promotion: PASS; canonical remained protected.
- Web promotion: PASS; canonical public surfaces verified.
- Rollback step was not needed and was skipped.

## Current Technical Beta scope

### Open / technically released

- Email-first authentication through real Gmail API production transport.
- Production API and database for the released Email-first scope.
- Public Web landing/support/legal/account-deletion-request surfaces.
- Protected Admin operations shell.
- Listener onboarding/training/assessment foundations only to the extent already source- and production-gated.

### Intentionally closed / fail-closed

- Caller voice.
- Payment/top-up.
- KYC provider flow.
- Payout provider flow.
- Telephony.
- Production SMS/phone OTP until a real approved provider/template gate is satisfied.
- Any commercial feature that depends on a still-closed provider.

These are not defects in the Technical Beta release; they are deliberately closed capabilities and must not be represented as production-ready.

## External/non-code gates still remaining

These do not require another API/DB/frontend redeploy unless their scope changes source or configuration:

1. **Administrative/legal/licensing process** for operating the service — handled separately from this repository release.
2. **Commercial hosting eligibility** must be re-checked against the then-current Vercel plan/terms before paid traffic is opened. No plan purchase/upgrade is authorized by this document.
3. **Caller/payment/KYC/payout/telephony/SMS** each require their real provider contract/configuration/credentials and live verification before opening.
4. **Native store release** still requires real Expo/EAS linkage where applicable, approved production artwork, Android signing/store credentials, Apple signing/App Store credentials, final metadata/privacy declarations and a verified signed production build.
5. **Final destructive account deletion/anonymization** remains blocked until retention rules are defined for financial ledger, payment/payout, safety, disputes and other retained/open records. The current production surface implements the safe deletion-request stage only.

## Repository governance note

- As last read on 2026-09-03, GitHub branch `main` reports `protected: false`.
- This did not invalidate the guarded Technical Beta production release because all production mutation workflows independently require `main`, exact manual confirmation, target guards and QA lineage.
- Branch protection is nevertheless recommended repository hardening and should be enabled when repository governance is configured; it is not a reason to mutate the already-verified production runtime.

## Release conclusion

For the defined **Email-first Technical Beta** scope, the technical production release is complete and verified.

Do not rerun database migration, API deployment or frontend deployment merely to obtain another green check. Reopen a production release only when new source/configuration/provider evidence changes the released scope.

## Non-negotiable rules

- Do not touch Evidence Axis from Listener release workflows.
- No production mutation outside the guarded exact Listener targets.
- Never use test-only Neon projects for production.
- Never guess provider behavior.
- Never expose secrets, private identity data, banking data, OTPs or session material.
- Closed provider capabilities stay fail-closed.
- Never mark a new launch gate green unless it actually ran and passed.
