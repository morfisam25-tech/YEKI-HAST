# W70 — Safe Preview + Final Code Closure

## 0. Branch / SHA

- Created from W65 HEAD exactly: `42784c9c4f0391440b6806a36b6429e646bf3c82` (`w65/final-integrated-preview-rc-20260915`, verified clean tree before branching).
- Branch: `w70/safe-preview-final-code-closure-20260918`.

## 1. Repository reconciliation

- Compared `main`, `w63`, `w65` (this branch's base), and the task's named `w66/android-closed-test-day0-20260915`.
- **`w66/android-closed-test-day0-20260915` does not exist** — not on `origin`, not locally, and no commit anywhere in `git log --all` matches that name or a "day0"/"W66" marker. Nothing could be diffed or ported from it. This is flagged rather than silently skipped or fabricated.
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

## 7. Safe Preview deploy — still externally blocked (Vercel access)

Checked fresh in this session rather than assuming W65's finding still held:

- Neon MCP access: **works**, with `ADMIN` permission. Confirmed both `small-art-04835373` (`yeki-hast-internal-beta-preview`) and `weathered-bar-87205560` (`yeki-hast-production`) exist exactly as the brief states, and that the Preview DB is the one already migrated through 0011 (not re-touched this session — no destructive re-migration was run).
- Vercel MCP access: `list_teams` → empty; `list_projects` returns project names (`web`, `yeki-hast-admin`, `yeki-hast-api`, `admin`, `yeki-hast`, plus unrelated `unique-holding-*`/test projects) under `team_sFX59XK1BfLb2P6lt0pX1Ve9`, but calling `get_project`/`get_team` on that team **403s**: `"Not authorized: Trying to access resource under scope \"ytdjdbhk5y-3701s-projects\". You must re-authenticate to this scope or use a token with access to this scope."`
- This is the same class of failure W65 documented (`PREVIEW_DEPLOY_EXTERNAL_BLOCKER`, then against team `unique-6ff0`): the Vercel token available to this session can list project *names* but has no actual authorized scope to read or deploy them. No Preview deployment could be created, updated, or inspected.
- Per instruction, no fallback origin, no Production deployment, and no attempt to route around this was made.

**PREVIEW_DEPLOY_EXTERNAL_BLOCKER (still open):** an owner with a properly-scoped Vercel token/session needs to either grant this session's token access to the `ytdjdbhk5y-3701s-projects` scope, or run the Preview deploy manually from an authenticated session, before Phase 7/8 can proceed past source-readiness.

## 8. Real Preview smoke — blocked transitively by §7

Nothing is deployed, so no live API/Web/Admin/RealtimeKit smoke could be run. What could be verified without a live deployment was verified instead (§6), plus the source-level recording/billing correctness review (§3/4). No live PASS is claimed for anything requiring a running deployment or real audio — this includes all of the W67 app-level items.

## 9. Code cleanliness

Repo-wide case-insensitive scan for `TODO|FIXME|HACK|placeholder|fake/mock/synthetic success`: only legitimate HTML `placeholder=` input attributes (Persian/English form hints) and one CI-only fake service-account JSON literal explicitly marked `ci-only-placeholder-not-a-credential` in `.github/workflows/foundation-qa.yml`. **No TODO/FIXME/HACK markers, no fake-success paths, no dead Production fallback branches found anywhere in source.**

## 10. Summary of what changed on this branch

1. `services/api/src/lib/recording-config.ts` — retention default 90 → 30 days (resolves W65's open `OWNER_POLICY_DECISION_REQUIRED`).
2. `apps/web/app/terms/page.tsx`, `apps/web/app/privacy/page.tsx` — added operator identity, address, governing-law clause; corrected retention/safety-hold figures to the locked 30/180-day policy.
3. `tests/recording-config.test.ts`, `tests/w33-public-legal-trust.test.ts` — updated/added regression coverage for the above.

No other source changes. Nothing in Phase 3/4 (recording/billing core) needed a code change — it was already correct.
