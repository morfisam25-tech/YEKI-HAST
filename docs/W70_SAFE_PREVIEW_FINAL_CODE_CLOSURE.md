# W70 — Safe Preview + Final Code Closure

## 0. Branch / SHA

- Created from W65 HEAD exactly: `42784c9c4f0391440b6806a36b6429e646bf3c82` (`w65/final-integrated-preview-rc-20260915`, verified clean tree before branching).
- Branch: `w70/safe-preview-final-code-closure-20260918`.

## 1. Repository reconciliation

**Correction (this section originally, incorrectly, stated that `w66/android-closed-test-day0-20260915` did not exist anywhere.** That was wrong: the branch exists on `origin` at exactly `5ecbcda30f28c52827fb093e2e0b4e1d4d2c8f44`. The original check ran `git branch -a` against this session's already-cloned local remote-tracking refs without first running `git fetch origin` — the branch had been pushed after that clone's last fetch, so it was locally invisible, not actually absent. Confirmed and corrected via explicit remote inspection: `git ls-remote origin refs/heads/w66/android-closed-test-day0-20260915` returned the exact SHA, then `git fetch origin refs/heads/w66/...:refs/remotes/origin/w66/...` retrieved it. Lesson applied: `git ls-remote`/`fetch` before declaring any ref absent, not a stale local listing.

- W66 branches from `c64308edb71533fdcea915eb884f38303021c096` — the **same W63 HEAD** that W65 (and therefore W70) also branches from (`git merge-base w66 w65` == that SHA exactly). W65 is not an ancestor of W66 and W66 is not an ancestor of W65/W70; they are siblings.
- `git diff --stat` between that shared W63 base and W66's HEAD: **`docs/W66_ANDROID_CLOSED_TEST_DAY0.md | 311 +++++++...`, 1 file changed, 311 insertions, 0 deletions.** W66 is a single, docs-only commit — it added a Android/Play-readiness audit report and **changed zero application source, config, or dependency files.**
- Reconciliation against the "known W66 facts" in the task brief — every one of them is a *finding the W66 audit made about the source it checked out*, not a change it introduced, and every one was independently re-verified as already true of current W70 source:
  - `apps/mobile/app.json`: `"package": "app.yekihast.mobile"`, `"versionCode": 8` — present, unchanged.
  - `apps/mobile/package.json`: `@cloudflare/realtimekit-react-native ^2.0.0`, `@cloudflare/react-native-webrtc ^137.0.1`, `expo ~57.0.9` (resolves to `57.0.18`, whose Expo-managed Android defaults are compileSdk/targetSdk 36 — no explicit `targetSdkVersion`/`compileSdkVersion` override exists anywhere in `apps/mobile`, by design; Expo supplies it) — present, unchanged.
  - `eas.json` project id `58b9f62d-db82-421a-ad59-edccac70c316` — present, unchanged.
  - "No AAB had yet been created" / "EAS authentication/signing were external blockers" — these are W66's own audit *findings*, not defects for W70 to fix; they restate the same EAS-credential gap W65 already documented (§7 below, unchanged).
- **Classification: (A) already present in W70/W65 for every item — nothing falls into (B) Android-only-and-separate, (C) missing-launch-critical-code, or (D) obsolete/conflicting, because W66 contains no code to be missing, separate, or conflicting.** No files were ported; none were needed. This was verified by reading W66's actual diff and by independently re-grepping the current W70 tree for each documented fact (see above), not by trusting the doc's prose alone.
- The rest of W66's document (Play Console Day-0 checklist, tester procedure, physical-device smoke plan, external Owner actions for EAS/signing/Console) is legitimate operational content for the *separate* Android Play-launch track, orthogonal to this task's Web-launch scope. It was read in full and is not duplicated into this doc; nothing in it contradicts or is missing from current W70 source.
- The nearest same-topic branch, `origin/w37/android-closed-testing-rc-20260913`, is **not** an ancestor of W65/W70 and was **not** named in this task's source-of-truth list, so nothing was merged or cherry-picked from it — doing so would be unrequested scope expansion onto a branch the brief never authorized.
- `main` was not merged and not mutated.
- W9 frozen Home/media: confirmed still byte-identical via the repo's own `frozen Home files retain the exact approved blobs` test (part of the full suite, unchanged, passing).

## 2. Safe Preview hardening — verified, not re-implemented

Already fail-closed from prior work (W57/W60/W63); spot-verified by source read plus the existing passing guard tests (`database-url-tls-guard`, `preview-provider-bypass-guard`, `preview-backend-routing-guard`, `deployment-api-base-guard`, `production-origin-guard`, `mobile-preview-routing-guard`):

- `packages/db/src/client.ts`: `DATABASE_URL` is required; throws if missing. No hardcoded fallback connection string anywhere in the tree.
- `apps/mobile` Preview build profile carries no `EXPO_PUBLIC_API_BASE_URL`; resolution fails closed (missing or Production-pointing) rather than silently defaulting.
- Web/Admin server proxies source-lock the production API origin and only allow non-production overrides in non-production environments (existing tests, still passing).

No code change was needed here; W65 had already done this work correctly.

## 3/4. Recording + billing lifecycle — read and verified, no defects found

Traced end-to-end in `services/api/src/services/recording-lifecycle.ts` and `call-media-session.ts`:

- **One call session**: `app.call_media_sessions` is `UNIQUE(call_session_id)`; `ensureCallMediaSession` reuses the existing row idempotently (including under the documented two-racing-requests case, resolved via `ON CONFLICT DO NOTHING` + re-read).
- **Fresh provider confirmation before billing**: `confirmRecordingActiveForBilling` always re-queries the provider's live status (`getRecordingStatus`) before returning `active: true` — never trusts DB state, a prior "starting" response, or meeting existence alone.
- **Billing ordering**: `reconcileRecordingForHeartbeat` sets `billing_started_at` only after `confirmRecordingActiveForBilling` returns `active`, inside the same row-locked transaction, and only `COALESCE`s (never overwrites) an existing timestamp.
- **Idempotency**: consent insert (`ON CONFLICT ... DO UPDATE`), media session creation, recording start/stop, and settlement (`settleCallByProvider` — explicit `alreadySettled` check before any financial mutation, `idempotency_key` on ledger rows) are all guarded.
- **Fail-closed timeout**: a recording-required call whose recording never confirms active within `CALL_RECORDING_CONFIRMATION_TIMEOUT_SECONDS` is surfaced as `timeout` (zero-charge path), not left billing indefinitely.

No bugs were found in this path. This matches what W58/W60/W63 already built and tested; W70 did not re-design or touch it.

**Not resolved by source review alone (unchanged from W65's own assessment):** the four W67 app-level "prove it happened live" items (fresh RECORDING status observed in the running app, `billing_started_at >= confirmed recording` observed on a real call, no duplicate recording/billing on a real reconnect) require an actually deployed Preview + a real two-party RealtimeKit session. These remain PARTIAL — see §7/§8.

## 5. Legal/trust routes — real gap found and fixed

All six canonical routes (`/privacy`, `/terms`, `/account/delete`, `/safety`, `/safety/children`, `/trust`) already existed and pass their existing content tests. Checking them against this task's locked owner-provided facts found a genuine gap: **no operator entity, address, or governing-law clause appeared anywhere on the public site**, and recording retention text said "~90 days operational default" with no defined safety-hold period — W65 had explicitly flagged the retention period as `OWNER_POLICY_DECISION_REQUIRED`.

Fixed, using exactly the facts locked in this task (nothing invented):

- Added an "Operator / governing law" section to [apps/web/app/terms/page.tsx](../apps/web/app/terms/page.tsx) and [apps/web/app/privacy/page.tsx](../apps/web/app/privacy/page.tsx): **UNIQE OTOMOTİV KİMYA SANAYİ LİMİTED ŞİRKETİ**, Akçaburgaz Mah. 1584 Sok. No: 10, Esenyurt / İstanbul / Türkiye; governing law stated as Türkiye generally — **no city-specific court invented**.
- Updated the privacy retention paragraph: recordings retain a maximum of **30 days** by default, and up to **180 days after a case's final closure** when linked to an open safety/complaint case — replacing the vague "~90 days, not yet decided" language.
- Changed `recordingRetentionDays()`'s default in [services/api/src/lib/recording-config.ts](../services/api/src/lib/recording-config.ts) from `90` to **`30`** to match the now-published policy (this resolves W65's `OWNER_POLICY_DECISION_REQUIRED` item — the decision arrived as a locked fact in this task). `CALL_RECORDING_RETENTION_DAYS` remains overridable per environment.
- The existing legal-hold mechanism (`private_data.call_recording_sessions.legal_hold`, admin-managed, released explicitly via the Admin recordings UI) is left as-is: an admin holding a case-linked recording and releasing it at/around case closure already satisfies "up to 180 days after closure" — no new auto-expiry mechanism was invented, since the brief says not to invent new product rules or redesign working systems.
- No generic "verified identity" claim exists or was added anywhere in these pages (checked).
- Regression test added: `tests/w33-public-legal-trust.test.ts` → `terms and privacy name the operator, governing law, and the locked 30/180-day recording windows` (asserts the operator string, address, "تابع قوانین ترکیه است" governing-law line, the 30/180-day figures, and the absence of any invented court reference).
- `tests/recording-config.test.ts` updated for the new default (30, not 90).

## 6. Test / build matrix (this session, real runs)

| Check | Result |
|---|---|
| `npm test` (full suite) | **823 tests: 819 pass, 0 fail, 4 skipped** |
| `npm run typecheck` (all 7 workspaces) | **PASS** |
| `npm run validate:foundation` | **PASS** — 93/93 checks |
| Web build (`next build`) | **PASS** (pre-existing, unrelated `themeColor` metadata warnings only) |
| Admin build (`next build`) | **PASS** |
| API | no bundling build step (runs directly via `node --experimental-strip-types`); typecheck covers it |
| Mobile | typecheck covered by the workspace run above; no EAS-authenticated session available to run a real build (see §7) |

The 4 skipped tests are `recording-runtime-db`, `call-media-runtime-db`, and the two `admin-safety-*-runtime-db` suites. Each self-skips because no local PostgreSQL server binaries (`initdb`/`pg_ctl`) are present on this machine — confirmed by checking `PATH` directly, same finding as W65 on the same class of environment. These scripts are deliberately designed to spin up a **throwaway, disposable** local Postgres cluster per run; they are not designed to run against the shared Preview Neon database, and running them there would pollute the actual Preview environment that Phase 8's live smoke test needs to stay clean. This is documented, expected self-skip behavior, not a defect and not silently waived.

## 7. Safe Preview deploy — still externally blocked (Vercel access), verified against the exact named target

Checked fresh in this session, twice — once against whatever the token's own `list_projects` surfaced, then again explicitly against the exact verified target supplied for this reconciliation:

- Neon MCP access: **works**, with `ADMIN` permission. Confirmed both `small-art-04835373` (`yeki-hast-internal-beta-preview`) and `weathered-bar-87205560` (`yeki-hast-production`) exist exactly as the brief states, and that the Preview DB is the one already migrated through 0011 (not re-touched this session — no destructive re-migration was run).
- First pass — Vercel MCP `list_teams` → empty; `list_projects` returns project names (`web`, `yeki-hast-admin`, `yeki-hast-api`, `admin`, `yeki-hast`, plus unrelated `unique-holding-*`/test projects) under `team_sFX59XK1BfLb2P6lt0pX1Ve9`, but calling `get_project`/`get_team` on that team **403s**: `"...scope \"ytdjdbhk5y-3701s-projects\". You must re-authenticate..."`.
- Second pass — retried against the **exact verified target** (team slug `unique-6ff0`, team id `team_GmseY3ibD05FWemVhLElL3hI`, project id `prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy`): `get_project(idOrName: "prj_ijhc8kDsH24eQK5TfhFOqW8RVSxy", teamId: "team_GmseY3ibD05FWemVhLElL3hI")` → still **403 Forbidden**: `"Not authorized: Trying to access resource under scope \"unique-6ff0\". You must re-authenticate to this scope or use a token with access to this scope."` `list_teams` still returns `{"teams": [], "pagination": {"count": 0}}` — zero teams visible to this token, confirming it is not merely a wrong-ID issue.
- Vercel CLI: no `.vercel/project.json` link exists anywhere in the repository tree (checked, none found); `npx vercel whoami` timed out with no output after 20s — no interactive/authenticated CLI session available in this environment (same class of failure W65 recorded as "timed out / EPIPE").
- This confirms, against the precise team/project identifiers supplied for this exact purpose, that the credential attached to this session has **no authorized scope on the `unique-6ff0` team at all** — not a stale ID, not a caching artifact. Per instruction, Preview work stops here: no new Vercel project was created, no Production deployment or secret copy was attempted, and no workaround/fallback origin was used.

**PREVIEW_DEPLOY_EXTERNAL_BLOCKER (still open, now doubly confirmed against the exact named team/project):** the owner needs to either (a) grant a token in this environment's Vercel MCP connector actual member access to team `unique-6ff0` (`team_GmseY3ibD05FWemVhLElL3hI`), or (b) run the Preview deploy manually from their own already-authenticated Vercel session. Neither can be done from inside this session without that access — this is not a source-code or configuration defect.

## 8. Real Preview smoke — blocked transitively by §7

Nothing is deployed, so no live API/Web/Admin/RealtimeKit smoke could be run. What could be verified without a live deployment was verified instead (§6), plus the source-level recording/billing correctness review (§3/4). No live PASS is claimed for anything requiring a running deployment or real audio — this includes all of the W67 app-level items.

## 9. Code cleanliness

Repo-wide case-insensitive scan for `TODO|FIXME|HACK|placeholder|fake/mock/synthetic success`: only legitimate HTML `placeholder=` input attributes (Persian/English form hints) and one CI-only fake service-account JSON literal explicitly marked `ci-only-placeholder-not-a-credential` in `.github/workflows/foundation-qa.yml`. **No TODO/FIXME/HACK markers, no fake-success paths, no dead Production fallback branches found anywhere in source.**

## 10. Summary of what changed on this branch

1. `services/api/src/lib/recording-config.ts` — retention default 90 → 30 days (resolves W65's open `OWNER_POLICY_DECISION_REQUIRED`).
2. `apps/web/app/terms/page.tsx`, `apps/web/app/privacy/page.tsx` — added operator identity, address, governing-law clause; corrected retention/safety-hold figures to the locked 30/180-day policy.
3. `tests/recording-config.test.ts`, `tests/w33-public-legal-trust.test.ts` — updated/added regression coverage for the above.
4. This doc — corrected the earlier false statement that `w66/android-closed-test-day0-20260915` does not exist (§1), and recorded a second, exact-target-verified Vercel access attempt (§7).

No other source changes. Nothing in Phase 3/4 (recording/billing core) needed a code change — it was already correct. No W66 material was ported: W66 is a documentation-only commit whose every documented fact was independently re-confirmed as already present in current W70 source (§1).
