# Listener APP / «یکی هست» — Launch Readiness

Last reviewed: 2026-09-03

This document defines the stable launch gates. Live state, current HEAD, run IDs, infrastructure findings and the exact remaining blockers are maintained only in [`LAUNCH_STATUS.md`](./LAUNCH_STATUS.md). If the two files ever appear to disagree, `LAUNCH_STATUS.md` is authoritative for current state.

## Non-negotiable production rules

- Production Vercel team: `UNIQUE` only.
- No database migration, reset or role creation without explicit approval.
- No invented telephony semantics, provider references or fake production OTP behavior.
- Production remains fail-closed when a required provider, credential or policy is unavailable.
- Secrets, bank details, private identity data, OTPs and session material must never be committed or printed.
- Caller remains closed until its full launch gate is genuinely ready.
- A build, Vercel `READY` state or `/health` 200 alone is not evidence that the application is launch-ready.

## Release integrity gate

A production release requires all of the following:

1. A real committed root `package-lock.json` generated from current `main` with Node `22.23.1` and npm `10.9.8`.
2. Clean `npm ci --ignore-scripts --no-audit --no-fund` validation of that lock.
3. A real Foundation QA execution on the resulting current `main`; a zero-step Actions failure does not count as either PASS or source failure.
4. API/Web/Admin production builds must use the lock-installed release tooling pinned in root `package.json` and deploy only prebuilt Vercel output.
5. Automatic Vercel Git deployment remains disabled; controlled workflows are the production path.
6. Every production mutation workflow, including DB migration, must require a successful Foundation QA ancestor for the source it operates on.
7. API deployment, frontend deployment and DB migration are manual-only workflow dispatches with exact confirmation phrases. A push/marker commit must never directly mutate production.

## API production gate

Before API production is considered ready:

- The exact production database is verified read-only by `scripts/verify-production-db.mjs`.
- The API release workflow itself never runs a migration. If the approved production database has not yet been initialized, schema changes may occur only through the separately approved, exact-target guarded migration workflow and must be followed by the read-only verifier before API deployment.
- Before production mutation, the workflow captures the current READY API production deployment as a rollback target.
- `/health` returns 200 for the exact deployed release SHA.
- `/ready` returns 200 and reports both database and schema ready.
- `/v1/bootstrap` returns 200 with the expected market, languages, feature gates and public-release configuration.
- Real Email OTP delivery, verify, authenticated session and logout/revocation E2E passes.
- If a new API deployment was created but readiness/bootstrap or Email E2E fails, the release workflow must request rollback to the captured previous production deployment.
- Production dev OTP and development telephony remain forbidden.

## Public Web and Admin gate

The controlled frontend release must:

- Require both Web and Admin to be protected before any new frontend production deployment begins.
- Make only Vercel project `web` public by disabling Vercel Authentication SSO through the controlled release workflow after protected pre-cutover smoke passes.
- Keep Vercel project `admin` protected.
- Serve `/`, `/privacy`, `/terms` and `/account/delete` publicly without a Vercel-authentication redirect after cutover.
- Require all four public Web smoke checks to pass.
- Require unauthenticated Admin access to return an actual protection response: redirect, 401 or 403. A 404 or 5xx is not protection.
- Then verify the real Admin shell through authenticated Vercel CLI access.

The checked-in first-party public URLs are:

- Privacy: `https://web-unique-6ff0.vercel.app/privacy`
- Terms: `https://web-unique-6ff0.vercel.app/terms`
- Account deletion: `https://web-unique-6ff0.vercel.app/account/delete`

A real support mailbox remains required. The technical-beta source currently selects `sales@uniqueholding.com.tr`, but source selection alone is not proof of mailbox readiness: the production domain-wide-delegated Gmail API Email OTP delivery/readback E2E must pass before release. Replacing the support identity requires an intentional source/public-surface update and equivalent real verification; a secret-only override must not silently redirect support.

## Account deletion gate

The current source implements the safe request stage:

1. Ownership is verified through Email OTP on the public Web deletion page.
2. The user explicitly confirms the destructive request.
3. The API records an idempotent pending `account_deletion_requested` audit event.
4. Active sessions are revoked immediately.
5. New Email OTP and Phone OTP sessions are blocked while deletion remains pending.
6. The Admin queue is authenticated/read-only and does not expose email, phone, identity or banking payloads.
7. The product and Admin UI do not claim deletion/anonymization has completed or expose a final-delete action.

Final destructive deletion/anonymization must not be implemented until retention rules are defined for financial ledger, payment/payout, safety, disputes and other open records.

## Caller gate

Caller cannot open until every applicable dependency is real and verified:

- explicit age-policy values;
- real telephony provider contract, documented semantics and credentials;
- real call-phone verification provider configuration and delivery verification;
- real payment provider configuration and live verification;
- public Privacy, Terms, Account Deletion and Support surfaces ready;
- commercial hosting eligibility cleared;
- production readiness checks green.

The absence of any one of these keeps Caller closed. No mock or development provider may substitute for a production dependency.

## Listener operational gates

Listener onboarding, training, assessment and operational foundations exist in source, but production capabilities must be described according to what has actually been verified.

Before the corresponding operation is treated as production-ready:

- KYC requires a real provider and live verification.
- Payout requires real credentials and live verification.
- Financial status must come from real provider and ledger records; ambiguous results remain unresolved rather than being marked successful.

## Mobile store gate

The mobile source has stable Android/iOS identifiers and EAS profiles, but Store-ready status requires all of the following external facts:

- real Expo/EAS project linkage (`extra.eas.projectId`);
- approved production icon/adaptive-icon/splash artwork checked into source and referenced by app config;
- real Android signing/store credentials;
- real Apple signing/App Store credentials;
- final store metadata and privacy declarations based on the actual production behavior;
- an actual signed production build that is verified.

Do not invent an Expo project ID, signing credential or finished brand asset.

## Commercial hosting gate

The production workload must be on a Vercel plan eligible for commercial use before paid traffic is opened. Current plan state and the current Vercel terms are recorded in `LAUNCH_STATUS.md` and must be re-verified before launch.

## Definition of launch-ready

Do not mark the project launch-ready until all gates applicable to the intended release scope are green in live production. In particular:

- current HEAD has a real full QA PASS;
- dependency lock is real and validated;
- production database migration, if required for the approved empty target, completed only through the guarded workflow and the post-migration read-only verifier passed;
- API readiness/bootstrap passed;
- real Email OTP E2E passed;
- public Web and protected Admin smoke checks passed on the exact deployed source;
- public policy/support surfaces are valid;
- the hosting plan is eligible for the intended commercial use;
- every provider required by the opened scope has passed real production verification;
- Caller remains closed until its complete gate is green;
- mobile is called Store-ready only after a verified signed store build exists.
