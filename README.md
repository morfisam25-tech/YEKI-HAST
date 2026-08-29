# یکی هست — Yeki Hast

Human-listening marketplace foundation with separate API, public Web, protected Admin and Expo mobile applications.

## Repository layout

- `services/api` — shared application API and provider boundaries.
- `apps/web` — public Web entry, Email OTP, Privacy, Terms and account-deletion request surfaces.
- `apps/admin` — protected operational Admin surfaces.
- `apps/mobile` — Expo mobile client.
- `packages/db` — database client, schema/migration material and read-only verification tooling.
- `packages/domain`, `packages/types`, `packages/config` — shared domain and configuration packages.
- `tests` — source guards and behavior/invariant tests.
- `.github/workflows` — controlled QA and production release workflows.

## Runtime and dependency policy

The release toolchain is pinned in the root manifest:

- Node `22.23.1` for controlled QA/release workflows.
- npm `10.9.8` for dependency-lock generation.
- Vercel CLI `59.3.0` and esbuild `0.25.9` as root dev dependencies.

Production workflows require a committed root `package-lock.json`, install with `npm ci --ignore-scripts --no-audit --no-fund`, use the lock-installed release binaries and deploy prebuilt Vercel output. Do not fabricate or manually approximate the lockfile.

## Production rules

- Authorized Vercel team: `UNIQUE` only.
- No database migration/reset/role creation without explicit approval.
- No fake production OTP, telephony or provider behavior.
- Production is fail-closed when a required credential, provider or policy is unavailable.
- Caller remains closed until its complete production-readiness gate is green.
- Never commit secrets, bank details, private identity data, OTPs or session material.

## Launch state

Current live state, exact blockers, run IDs and controlled activation sequence are maintained in [`docs/LAUNCH_STATUS.md`](docs/LAUNCH_STATUS.md).

Stable launch criteria are documented in [`docs/LAUNCH_READINESS.md`](docs/LAUNCH_READINESS.md).

Do not use older chat summaries or historical QA notes to declare the current HEAD ready. A release is green only after the exact current source has passed the required real checks.
