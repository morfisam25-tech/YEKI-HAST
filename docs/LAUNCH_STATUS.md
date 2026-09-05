# Launch Status — یکی هست

Last verified: 2026-09-05

This file is the repository source of truth for the current technical release. Re-check live GitHub/Vercel/provider state before trusting older chat notes.

## Executive status

**Email-first Technical Beta production release: PASS for the currently opened scope.**

Production DB, API, Gmail Email OTP, public Web, custom domains and protected Admin are healthy for the released scope. Caller voice, payment, KYC, payout, telephony and production phone/SMS remain intentionally fail-closed.

Native Store release is not yet complete because signed binaries, developer-account records and final production artwork still require external account/credential or visual-approval work.

## Current source and QA

- Current verified `main`: `94b6a697a74eda5f70b5cb22a6fa511dc9b2c365`.
- Foundation QA on this exact `main`: Actions run `33930845617` — **SUCCESS**.
- QA passed dependency lock validation, runtime syntax, Foundation tests, invariant validation, Email-first production security verification, workspace typecheck, Web/Admin builds, Android/iOS exports, API bundle and artifact upload.
- Vercel production scope remains Team `UNIQUE` only (`team_GmseY3ibD05FWemVhLElL3hI`).
- Evidence Axis is excluded from Listener release workflows.

## Production database — PASS

- Neon project: `weathered-bar-87205560` / `yeki-hast-production`.
- Branch: `production` (`br-plain-paper-aucjl3y6`).
- Database: `neondb`.
- Region: `aws-us-east-1`.
- Official migrations `0001_initial.sql` and `0002_email_auth.sql` are recorded.
- Migration + verification previously passed.
- **Do not rerun migrations for Store preparation.**

## Production API — PASS

- Project: `prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy`.
- Canonical API: `https://yeki-hast-unique-6ff0.vercel.app`.
- Current live release SHA reported by `/health`: `005809afa503803e5c3405e42d1de73b63931479`.
- Verified live after the Web/domain release:
  - `/health`: HTTP 200
  - `/ready`: HTTP 200
  - `/v1/bootstrap`: HTTP 200
- No API runtime source changed during the final Web workflow fixes, so no redundant API redeploy was performed.

## Gmail production auth — PASS

- Gmail API enabled.
- Service account: `yeki-hast-production-mail@yeki-hast-production.iam.gserviceaccount.com`.
- Workspace DWD configured.
- OAuth client ID: `116733941915896907799`.
- Authorized scopes are exactly `gmail.send` and `gmail.readonly`.
- Production sender: `sales@uniqueholding.com.tr`.
- Sender name: `یکی هست`.
- Real Email OTP E2E previously passed.

## Production Web — PASS

- Project: `prj_afhSiMYpsCfIAxuOmotLAWBvTMDg`.
- Vercel canonical: `https://web-unique-6ff0.vercel.app`.
- Primary product domain: `https://yekihast.app`.
- Final Web release workflow: `Deploy Production Web V2`.
- Successful production run: Actions run `33931970953` / run #2 — **SUCCESS**.
- Exact promoted deployment: `dpl_CjotkNAvNfYQq2T7pjZrfa9tCvjF`.
- Exact deployment source SHA: `94b6a697a74eda5f70b5cb22a6fa511dc9b2c365`.
- Deployment state: READY.

The guarded release passed:

- successful Foundation QA attestation for the source;
- protected staged deployment;
- exact staged deployment identity/READY/protection check;
- authenticated staged smoke;
- proof that the primary custom domain stayed on the previous deployment during staging;
- promotion only after staged verification;
- post-promotion deployment/domain-policy verification;
- public canonical surface verification;
- rollback was not needed.

### Public domain policy — PASS

Primary:

- `https://yekihast.app` — HTTP 200.

Permanent redirects:

- `https://www.yekihast.app` -> `https://yekihast.app` — HTTP 308.
- `https://yeki-hast.com` -> `https://yekihast.app` — HTTP 308.
- `https://www.yeki-hast.com` -> `https://yekihast.app` — HTTP 308.

Custom-domain smoke passed for:

- `/`
- `/privacy`
- `/terms`
- `/account/delete`

## Production Admin — PASS

- Project: `prj_l18v3f003ORfiN6hKxYwJbvVPzzC`.
- Canonical: `https://admin-unique-6ff0.vercel.app`.
- Last checked production deployment: `dpl_6TTNLifqhE6uCZTqw26KCXB35F6U` — READY.
- The final Web-only release did not redeploy Admin.

## Account deletion — PASS for Store-facing behavior

Current production behavior:

- clean account -> physical deletion;
- retention-sensitive account -> `202 review_required`;
- active operations admin -> `409` before destructive side effects;
- public deletion resource -> `https://yekihast.app/account/delete`.

The production admin account must not be used as a destructive deletion test target.

Older notes describing the implementation as deletion-request-only are superseded.

## Current released scope

### Open / technically released

- Email-first authentication through real Gmail API transport.
- Secure account sessions.
- Production API and DB for the released Email-first scope.
- Public Web landing, legal/support and account-deletion surfaces.
- Protected Admin operations shell.
- Listener onboarding/training/assessment foundations to the extent exposed by the current gates.

### Intentionally closed / fail-closed

- Caller voice.
- Payment/top-up.
- KYC provider flow.
- Payout provider flow.
- Telephony.
- Production SMS/phone OTP until its real provider/template gate is satisfied.

## Mobile / Store readiness

Mobile identity remains:

- name: `یکی هست`
- version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Expo SDK baseline: `~57.0.9`
- Android API target baseline: 36
- iOS/Xcode baseline: 26

Android and iOS source exports pass Foundation QA. Signed Store binaries have not yet been produced.

Current Store URL/remaining-blocker override: `docs/STORE_RELEASE_CURRENT.md`.

## Remaining Store blockers

1. Final approved production icon/artwork.
2. Authenticated access verification for the declared Expo/EAS project.
3. Google Play developer account/app record.
4. Apple Developer/App Store Connect account/app record.
5. Real Android signing credential.
6. Real Apple distribution/signing credential and provisioning profile.
7. Signed AAB/IPA from an exact clean release SHA.
8. Real distribution-path smoke of those exact signed artifacts.
9. Release-equivalent screenshots.
10. Final Google Play Data Safety, Apple App Privacy, rating and listing forms.
11. Upload and submission of the exact tested artifacts.

No DB migration, API redeploy, Admin redeploy or closed-provider opening is required merely to continue Store preparation.

## Repository governance

- `main` was last observed with branch protection disabled.
- Guarded production workflows still enforce exact branch/target/manual-confirmation/QA lineage independently.
- Branch protection remains recommended repository hardening but is not a reason to mutate the verified runtime.

## Non-negotiable rules

- Do not touch Evidence Axis from Listener workflows.
- Never expose secrets, tokens, signing material, OTPs or session data.
- Closed provider capabilities remain fail-closed.
- Never mark a release gate green unless it actually ran and passed.
- Do not create replacement production credentials/projects merely because account access has not yet been verified.
