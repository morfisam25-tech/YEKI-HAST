# Launch Status — یکی هست

Last reviewed: 2026-08-29

This file is the repository source of truth for launch state. Future work should inspect the real repo, Vercel, Neon and provider state before trusting an older chat summary.

## Current source state

- Production deployment workflows are pinned to Vercel Team `UNIQUE` and the exact YEKI-HAST API/Web/Admin projects.
- Automatic Vercel Git deployments are disabled; production deploys use the controlled workflows only.
- Production API/Web/Admin builds and Android/iOS exports were all proven green before the GitHub Actions allowance was exhausted.
- Mobile bootstrap is fail-closed: if the production bootstrap/catalog cannot be loaded, login and registration do not continue with stale fallback catalog data.
- Browser production sessions use HttpOnly + Secure + SameSite=Strict cookies and production cookie names use the `__Host-` prefix.
- Web/Admin declare CSP, anti-framing, no-sniff, referrer and browser-capability security headers in Vercel config.
- API JSON response helpers explicitly use `no-store`, no-sniff, anti-framing, no-referrer and restrictive JSON CSP headers.
- Caller closed beta is disabled by default.
- Manual phone verification beta is disabled by default.
- Admin bootstrap is disabled by default and its one-time enablement requires an expiry window.
- Production dev OTP and dev telephony are forbidden.
- Production runtime is pinned to Node 22, matching CI/build validation; EAS production uses the explicit SDK 57 Node 22.23.1 runtime and remote auto-incremented store versions.
- A one-shot dependency-lock workflow is prepared to generate and verify the repository's first real `package-lock.json` once Actions execution is available. Do not fabricate a lockfile.
- No database migration is authorized or required by the current launch workflow.

## Live production state last verified

- API `GET /health`: 200 / healthy.
- API `GET /ready`: 503 / intentionally not ready until production database configuration is supplied.
- Web production landing page: reachable and serving the real Persian Email OTP UI.
- Admin production app: deployed and protected by Vercel Authentication; the controlled frontend workflow uses authenticated `vercel curl` for the Admin post-deploy smoke instead of weakening that protection.

A healthy `/health` alone is never sufficient to declare production ready.

## External blockers

### 1. GitHub Actions allowance

The account reached 100% of the included Actions minutes on 2026-08-29. Runs currently fail before executing project steps. Do not interpret those quota failures as source failures. CI must be rerun after allowance resets or paid Actions usage is enabled.

After execution is available again, generate/verify/commit `package-lock.json`, switch install steps to `npm ci`, then rerun Foundation QA on the resulting current HEAD.

### 2. Production database credential

The Neon project/branch/database are known, but the connected Neon tool currently has a schema mismatch (`projectId` exposed by the tool vs `project_id` required by its backend) for connection-string and SQL actions. Do not invent or reconstruct the database password.

Required secure input for automated production deployment: `PRODUCTION_DATABASE_URL`.

### 3. Vercel production write credential

The current Vercel connector can inspect the intended UNIQUE projects but does not expose project environment-variable CRUD. The controlled GitHub production workflows therefore require repository secret `VERCEL_TOKEN`. Do not paste the token into chat.

### 4. Production Email OTP mailbox

The deployment workflow defaults to Google Workspace SMTP (`smtp.gmail.com`, port 465, TLS) and performs a real delivery/verify/session/logout E2E test.

Required secure inputs:
- `PRODUCTION_SMTP_USERNAME`
- `PRODUCTION_SMTP_PASSWORD` (Google Workspace App Password or other valid mailbox credential)

Do not fake OTP delivery in production.

### 5. Vercel commercial plan before paid launch

Vercel Team `UNIQUE` is currently on Hobby. Vercel's current Terms of Service and Fair Use Guidelines restrict Hobby to personal/non-commercial use and classify deployments used for financial gain, including requesting or processing visitor payments, as commercial usage.

Therefore:
- Hobby is acceptable only while this deployment remains non-commercial/pre-launch according to Vercel's rules.
- Before any paid beta, payment request/processing, or other commercial production use is opened, move the intended commercial deployment to an eligible Pro or Enterprise plan.
- Do not open paid Caller flows on the current Hobby plan.

## Provider-gated product surfaces

These are real external integration gates, not missing placeholder implementations to guess around:

- Caller voice launch: production telephony contract + verified adapter semantics. The Dialing technical-documentation request was sent; no vendor reply establishing the required contract was found as of 2026-08-29.
- Caller payments: real NextPay production credentials and callback configuration.
- Listener payout: real payout credentials.
- Listener KYC completion: real KYC inquiry provider configuration.
- Call-phone verification: real SMS provider, unless an explicitly approved closed-beta manual verification policy is enabled.
- Caller launch: explicit age-policy values plus all readiness dependencies.

Until those dependencies are real, the corresponding production surfaces must remain closed/fail-closed.

## Controlled launch sequence

Once GitHub Actions execution and the required external credentials exist securely:

1. Generate the dependency lock with the dedicated workflow, verify it with `npm ci`, commit the resulting `package-lock.json`, and convert CI/deploy installs to `npm ci`.
2. Rerun Foundation QA on the resulting current `main` and require a true green run.
3. Add only the required repository secrets through secure GitHub UI/storage.
4. Trigger the controlled Production API workflow.
5. Require DB verification without migrations.
6. Require `/health` 200, `/ready` 200 and a valid `/v1/bootstrap` response.
7. Require real Email OTP delivery, verification, authenticated session and logout/revocation E2E PASS.
8. Deploy Web and Admin through the exact UNIQUE frontend workflow and require both live smoke gates; keep Admin deployment protection enabled.
9. Review Admin integration-readiness output with secrets excluded.
10. Before commercial/payment traffic, upgrade the intended Vercel commercial deployment from Hobby to an eligible paid plan.
11. Keep Caller beta closed until telephony/payment/phone/age gates are all genuinely ready.
12. Only then enable the smallest intended beta surface and monitor runtime errors.

## Non-negotiable rules

- No Codex for this project.
- Do not touch Evidence Axis.
- No DB migration without explicit user approval.
- Never guess provider behavior or provider references.
- Never expose secrets, bank details, private identity data or OTP/session material.
- Production must fail closed.
- Never mark a launch gate green unless it was actually tested.
