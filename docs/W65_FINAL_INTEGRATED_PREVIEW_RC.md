# W65 — Final Integrated Preview RC + Recording Operations

## 0. SHAs

- **Base (W63 HEAD, `origin/w65/final-integrated-preview-rc-20260915` as received):** `c64308edb71533fdcea915eb884f38303021c096`
- **Final W65 SHA:** recorded in a follow-up commit on this branch after this document lands (`docs(w65): record final commit SHA`), per this repo's established pattern (see `c64308e`, `5df1157`, `76d74b2`).
- Branch verified against `origin` before any edit: `git rev-parse origin/w65/final-integrated-preview-rc-20260915` == the W63 base above, byte-identical tree (`git diff --stat` empty). Not recreated from `main`.

## 1. Final integration invariant

W57/W58/W60/W63 were not rebuilt. `origin/main` (`0e09f1a`) and this branch's base share ancestor `20b7a8c`; the branches are historically diverged as flagged, but W63 already contained the approved reel and reports Home freeze PASS. Migrations `0001`–`0011` are present and registered in `packages/db/src/migrate.ts`; `tests/migration-registration-guard.test.ts` (part of the full suite, §10) still passes, confirming disk/manifest/registration stay in sync.

## 2. W9 Home freeze verification (byte-for-byte)

Compared git blob hashes directly, not file contents by eye:

| File | `origin/main` blob | W65 base blob | Result |
|---|---|---|---|
| `apps/web/app/page.tsx` | `a4e72b963207178ea417a602fb733c411cbadec8` | `a4e72b963207178ea417a602fb733c411cbadec8` | **MATCH** |
| `apps/web/app/home.module.css` | `f99666c5899346084c47a58b9371be20582f3942` | `f99666c5899346084c47a58b9371be20582f3942` | **MATCH** |
| `apps/web/public/w9/diaspora-poem-reel.mp4` | `4e17dbb2d5db81ba90a7a50b1f9d0cc4572cc32c` | `4e17dbb2d5db81ba90a7a50b1f9d0cc4572cc32c` | **MATCH** |

All three approved blobs are already identical. Per instruction: **DID NOTHING** — no redesign, no copy/crop/image change. The repo's own `frozen Home files retain the exact approved blobs` test (part of the full suite, §10) independently confirms this.

## 3. Recording admin operations — implemented

Investigated the existing backend first (it was already complete and audited — W58): capability-gated routes in `services/api/src/routes/admin-recording.ts` (`getRecordingForSafetyCase`, `requestRecordingPlaybackGrant`, `setRecordingHold`, `releaseRecordingHold`), all behind `requireAdminCapability(req, 'recording_admin')`, registered in `services/api/src/handler.ts`. The actual gap was purely front-end: **no Admin UI page called any of it.**

Added, nothing else:

- [apps/admin/app/recordings/page.tsx](apps/admin/app/recordings/page.tsx) — new minimal Admin page:
  - Looks up a recording by its existing safe identifier (safety case kind + case id) via `GET /api/ops/safety-cases/{reports|events}/:id/recording` — no new backend surface.
  - Displays lifecycle/status metadata only (state, started/ended, retention-until, legal hold + reason, failure code) — never a storage reference.
  - "Request playback grant" — reason-code prompted, confirmed, then `POST /api/ops/recordings/:id/playback-grant`. Renders the returned grant id/expiry and the existing `playbackUrl`/`playbackUrlNote` fields verbatim (today `null` + a note, because archival storage integration is intentionally not provisioned yet — this UI does not invent one).
  - "Apply / release legal hold" — reason-code prompted, confirmed, then `POST /api/ops/recordings/:id/hold` or `/hold/release`.
  - No download link, no raw storage URL, no provider secret, no AI-training feature. Server-side audit logging (`app.audit_logs`) was already wired to every mutating route and required no change.
- [apps/admin/app/layout.tsx](apps/admin/app/layout.tsx) — one nav link ("ضبط تماس‌ها") added between Safety and Phone Verifications.
- [tests/admin-recording-ui.test.ts](tests/admin-recording-ui.test.ts) — new wiring test (7 cases): nav link exists; lookup uses the safety-case path (not a raw recording/storage id); playback-grant and hold/release calls are reason-coded and case-linked; the page never renders a storage reference, provider id, download attribute, or an `<a href>` built from `playbackUrl`; every route the UI calls still requires `recording_admin`; the routes stay registered in the handler.

No backend route was extended — the existing API already covered every required action. **Known pre-existing gap, left alone (out of minimal scope):** granting the `recording_admin` capability itself is DB-only (`app.admin_capabilities`); there is no API/UI to grant it. Flagging for a future, explicitly-scoped change rather than building capability-management UI here.

## 4. Recording retention

Already configurable, not hardcoded: `services/api/src/lib/recording-config.ts` reads `CALL_RECORDING_RETENTION_DAYS` (1–3650, validated), defaulting to `90` only when unset. No source change needed or made.

**OWNER_POLICY_DECISION_REQUIRED:** the 90-day default is an operational fail-safe, not a represented statutory/legal requirement. Final public retention period still requires an owner/legal decision. This did not block any Preview source work.

## 5. Preview database — migrated and verified

Target confirmed to be the existing, isolated project before any write:

- Project `small-art-04835373` ("yeki-hast-internal-beta-preview"), branch `br-wispy-sea-au31bwat` ("preview"), database `neondb` — matched the brief exactly.
- Confirmed **not** production: production is the separate project `weathered-bar-87205560` ("yeki-hast-production"); it was never connected to, queried, or migrated.
- Preflight: database was schema-empty (`information_schema.tables` returned zero rows outside `pg_catalog`/`information_schema`) before any migration ran.
- Ran the repo's own migration runner (`packages/db/src/migrate.ts`) against this database — the identical tool that would run in CI, not ad hoc SQL. `0001`–`0005` applied cleanly; `0006` failed closed on `internet_voice_pg_cron_database_not_configured` (`0006` and `0009` require the Neon `pg_cron` extension's `cron.database_name` compute setting, which is off by default on a fresh project — this is the same gap the local throwaway-Postgres runtime-DB test scripts document and route around by skipping 0006/0009 for *local* Postgres; it doesn't apply to disabling anything on Neon itself).
- Fixed at the infrastructure level, not by weakening the migration: set the endpoint's `pg_settings.cron.database_name = neondb` via the Neon API and restarted the compute (`ep-wandering-feather-auojsw0z`). Verified `current_setting('cron.database_name')` = `neondb` post-restart, then re-ran the migration runner: `0006`–`0011` applied cleanly (idempotency check confirmed `0001`–`0005` were skipped, not re-applied, matching recorded checksums).
- Ran `scripts/verify-production-db.mjs` (the production DB verifier guard — a read-only schema check; despite its name it takes `DATABASE_URL` as-is) directly against this database: **PASS** — all critical relations, the 11-value `recording_state` enum, and the recording/media `updated_at` triggers all verified present.
- Ran `packages/db/src/check.ts` (pricing sanity check): confirmed the IRR pricing plan for `yeki_hast` / `human_listening` / `ir` is present and active.
- The raw connection string was fetched once from the Neon API, used immediately and only as a local, non-echoed env file for the two script invocations above, then the file was deleted. It is not reproduced anywhere in this document or committed anywhere in the repository.

**Preview DB status: migrated through 0011, schema-verified, ready.**

## 6. Preview API / Web / Admin — blocked, could not deploy

Checked the actual credentials available in this environment rather than assuming:

- Vercel MCP connector: `list_teams` → `{"teams": []}`; `get_git_deployment_context` → `{"teams": []}`; `get_project` on the named API project (`prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy`) under team `unique-6ff0` → `403 Forbidden`.
- Vercel CLI (`npx vercel whoami`): timed out / `EPIPE` — no usable authenticated session either.

**PREVIEW_DEPLOY_EXTERNAL_BLOCKER:** the Vercel credentials available to this session have no access to team `unique-6ff0` or its three named projects (`yeki-hast` API, `web`, `admin`). No manual Preview deployment could be prepared or run. Nothing was deployed, and — per instruction — no fallback to any other origin was attempted; this is documented and the rest of the work continued.

## 7. Mobile Preview origin (EAS)

Re-verified the W63 fail-closed fix is intact (not re-implemented): `validate:foundation` (§10) still asserts "mobile Preview build profile no longer embeds the Production API origin literal" and "mobile API base URL resolution fails closed in preview_internal_beta (missing or Production-pointing)" — both **PASS**, unchanged.

`apps/mobile/eas.json`'s `preview` build profile currently sets `EXPO_PUBLIC_APP_ENV=preview_internal_beta` only; it deliberately carries no `EXPO_PUBLIC_API_BASE_URL` (that's the fail-closed behavior being tested).

**EAS_PREVIEW_EXTERNAL_BLOCKER:** `npx eas --version` / `npx eas whoami` could not resolve or run (`npm error could not determine executable to run`) — no authenticated EAS CLI session is available in this environment. This is moot in any case because §6 produced no isolated Preview API URL to configure — the task's own ordering (mobile origin depends on a real deployed Preview API URL) was respected: nothing was configured, and Production's URL was never written into the Preview profile.

## 8. Preview smoke

Blocked transitively by §6 (nothing is deployed to smoke-test against). What **could** be verified without a live deployment was verified instead (§10): full server-side test suite (822 tests), foundation validation, and direct schema verification against the real migrated Preview database (§5). No RealtimeKit live PASS was fabricated.

## 9. Live RealtimeKit readiness

Checked environment for real Cloudflare RealtimeKit credentials — none present (`env` scan for `realtimekit`/`dyte`-named variables returned nothing beyond an unrelated tracing var). No Cloudflare service was created or purchased.

**REALTIMEKIT_LIVE_EXTERNAL_BLOCKER:** no live two-party proof was run or claimed. This remains a separate, explicit LIVE gate for whoever holds the real credentials.

## 10. Release security — OWNER ACTION required

Read-only checks only; nothing changed:

- Repository visibility: **public** (confirmed via GitHub API).
- `main` branch protection: **none** (`GET .../branches/main/protection` → `404 Branch not protected`).

```
OWNER ACTION REQUIRED (account-level, not source-level):
1. github.com/morfisam25-tech/YEKI-HAST → Settings → General → Danger Zone
   → change repository visibility to Private (if intended before wider release).
2. github.com/morfisam25-tech/YEKI-HAST → Settings → Branches
   → add a branch protection rule for `main`:
     - require a pull request before merging
     - require status checks to pass (typecheck + test + validate:foundation)
     - disallow force pushes and branch deletion
```

No merge to `main` was performed or proposed.

## 11. Full final QA

Environment note: local Node is `v24.19.0`; the repo's mobile toolchain pins `22.23.1` (`apps/mobile/eas.json`) and `package.json` declares `"node": "22.x"`. Node 22.23.1 was not available to switch to in this environment; every suite below was run on the available Node 24.19.0 and all passed — noting the mismatch rather than silently ignoring it, per instruction not to waive discrepancies.

| Check | Result |
|---|---|
| All 7 workspace typechecks (`npm run typecheck`) | **PASS** — admin, mobile, web, api, db, domain, types |
| Full test suite (`node --test tests/*.test.ts`) | **822 tests: 818 pass, 0 fail, 4 skipped** (the 4 are the W58 recording / W60 call-media / W36 safety-admin ×2 runtime-DB suites, which self-skip without local PostgreSQL server binaries — none are present on this Windows workstation; this is the documented, correct self-skip behavior of those scripts, not a failure) |
| `validate:foundation` | **PASS** — every check, including all W58/W60/W63 recording and media invariants |
| Recording unit tests | **PASS** (`recording-config`, `recording-domain`, `recording-provider-realtimekit` — part of the full suite above) |
| W58 recording runtime DB suite | Self-skipped (no local `initdb`/`pg_ctl` on this host); confirmed this is scripted, expected behavior, not silently waived |
| W60 call-media runtime DB suite | Self-skipped, same reason |
| Safety admin runtime DB suite(s) | Self-skipped, same reason |
| Migration registration guard | **PASS** (part of the full suite) |
| Production DB verifier guard | **PASS** — run for real against the migrated Preview database (§5), not just as a source-text check |
| Web build (`next build`) | **PASS** (pre-existing, unrelated `themeColor` metadata warnings only) |
| Admin build (`next build`) | **PASS** — new `/recordings` route compiles and is listed in the build output |
| Mobile typecheck | **PASS** (part of the workspace typecheck run) |
| Billing/voice regression | **PASS** (part of the full suite: Wave 1 caps, extension idempotency, no-answer zero-charge, settlement, RealtimeKit media/billing tests) |
| Home freeze invariant | **PASS**, and independently confirmed byte-for-byte in §2 |

Two incidental `next build` side effects (`apps/admin/tsconfig.json`, `apps/admin/next-env.d.ts`, and the equivalent web files) were reverted before committing — they were Next.js tooling auto-edits unrelated to this change, not part of the intended diff.

## 12. External blockers (summary)

- `PREVIEW_DEPLOY_EXTERNAL_BLOCKER` — Vercel credentials in this session cannot access team `unique-6ff0` or its projects (§6).
- `EAS_PREVIEW_EXTERNAL_BLOCKER` — no authenticated EAS CLI session; also moot without a deployed Preview API URL (§7).
- `REALTIMEKIT_LIVE_EXTERNAL_BLOCKER` — no real Cloudflare RealtimeKit credentials present; live two-party proof not run (§9).
- Preview smoke (§8) is blocked transitively by the deploy blocker.

Nothing else in this task list was blocked. The Preview database (§5) and the recording Admin UI (§3) — the two concretely achievable, credentialed pieces of this task — were both completed and verified for real, not simulated.

## 13. Promotion readiness

This SHA is **safe to promote to the next stage source-wise**: all invariants hold, the Home freeze is untouched and verified, the new Admin surface is minimal/audited/tested, and the Preview database is migrated and schema-verified against the actual repo migration tooling.

It is **not yet fully release-complete** pending, in order: (1) Vercel access to actually deploy Preview API/Web/Admin, (2) an EAS-authenticated session to point the mobile Preview build at that deployed API origin, (3) a real Preview smoke pass once deployed, and (4) the separate live RealtimeKit two-party proof with real credentials. None of these are source defects; all are external credential/access gaps documented above.
