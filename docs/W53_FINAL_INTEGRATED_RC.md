# W53 Final Integrated RC

Non-production integration assembly of already-approved branches. No Production deploy,
no `main` merge, no Play upload, no provider activation, no database writes, no Vercel
resource changes were performed as part of this work.

## 1. Exact branch

`w53/final-integrated-rc-20260913`

## 2. Exact base

`0e94ed52ef55f04602d59d977c82b5c9fbe5d05a` — `release(w33): harden public legal and trust surfaces`

## 3. Integrated commit lineage

```
0e94ed5 release(w33): harden public legal and trust surfaces        <- branch base
f982d91 fix(w36): close safety admin enforcement gaps                (cherry-pick -x 631fa74)
4c2ca6d release(w37): prepare Android closed testing candidate       (cherry-pick -x 31f683d)
295850d feat(web): add approved diaspora poem reel                   (cherry-pick -x 0e09f1a)
```

Source SHAs (verified to exist on `morfisam25-tech/YEKI-HAST` before integration):

- W33 base: `0e94ed52ef55f04602d59d977c82b5c9fbe5d05a`
- W36 tip: `631fa749228947f4c09db77819735520ff73b6b2` (branch `w36/safety-admin-p0-closure-20260913`)
- W37 tip: `31f683de821b8b8c915da46a4e86ada21dd96535` (branch `w37/android-closed-testing-rc-20260913`)
- W9 Home reel: `0e09f1aab852e9b41afa6999213972687ec13425` (on `main`)

Topology found before integrating: W37's tip already has W33 as a direct git ancestor
(one commit ahead). W36's tip branches from `release(w29)`, one commit before W33, so it
does **not** contain the W33 legal/trust hardening. The W9 reel commit sits on `main`,
sibling to both, and is not an ancestor of W33 either. This is why W53 assembles by
cherry-picking onto a fresh branch rooted at the exact W33 SHA rather than merging
branch tips directly.

## 4. Conflict resolutions

**No git-level conflicts.** All three cherry-picks (`W36`, `W37`, `W9` reel) applied
cleanly with no conflict markers, because their file sets do not overlap:

- W36 touches `apps/admin/app/safety/page.tsx`, `services/api/src/routes/admin-*`,
  `services/api/src/routes/caller-call-request.ts`, `services/api/src/routes/marketplace.ts`,
  `scripts/run-safety-admin-runtime-db-test.sh`, `tests/admin-safety-*`, `package.json`.
- W37 touches `.env.example`, `apps/mobile/*`, `docs/W37_*`, `tests/caller-mobile-closed-beta.test.ts`,
  `tests/mobile-api.test.ts`, `tests/mobile-release-config-guard.test.ts`.
- W9 reel touches only `apps/web/app/page.tsx`, `apps/web/app/home.module.css`,
  `apps/web/public/w9/diaspora-poem-reel.mp4`.

`git diff <W33 base>..HEAD --stat` shows exactly 24 files changed, 870 insertions(+),
18 deletions(-) — the plain union of the three source commits' own diffs, with zero
additional integration edits.

**One real semantic conflict was found by actually running the test suite (see §12)**,
not by git: `tests/internal-owner-test-mode.test.ts` (`'Home freeze blobs remain exact'`)
and `tests/w33-public-legal-trust.test.ts` (`'frozen Home files retain the exact approved
blobs'`) both hard-pin the git blob SHA-1 of `apps/web/app/page.tsx` and
`apps/web/app/home.module.css` as a drift guard. Both were written at W33 time and pin
the **pre-reel** blobs (`e6074b4b…` / `d749d64a…`) — verified with
`git rev-parse 0e94ed5:apps/web/app/page.tsx` etc. Cherry-picking in the *approved* W9
reel (§7) necessarily changes those two files, so both guards now fail — correctly
flagging real drift, just against a baseline that predates an already-approved change.

**Resolution:** updated both hardcoded hash pairs to the W9 reel commit's own blob
hashes (`a4e72b96…` / `f99666c5…` — verified with
`git rev-parse 0e09f1a:apps/web/app/page.tsx` etc., i.e. exactly what §7 already proves
is in this branch), with a one-line comment explaining why. This is the narrow fix the
mission's integration-order step 5 calls for: the guard now protects the *new* approved
baseline instead of blocking it. Nothing about Home itself was changed — see §7.

## 5. W36 preservation proof

Verified directly in the integrated tree (`f982d91`):

- `services/api/src/routes/admin-safety.ts` uses `allowedStatuses = new Set(['open',
  'reviewing', 'resolved', 'dismissed'])` and `targetStatus = action === 'claim' ?
  'reviewing' : ...` — the canonical enum value, not the drifted `in_review`.
- `grep -rn "in_review"` across the integrated tree returns **zero** matches against
  `app.case_status`; the only substring hits are the unrelated `admin_review` listener-
  application-status enum, and test comments/assertions that explicitly assert
  `doesNotMatch(/in_review/)`. No regression.
- Typed jsonb audit params (`$5::text`, `$6::text`) present in `admin-safety.ts`.
- `services/api/src/routes/admin-safety-enforcement.ts` (new, 113 lines) implements
  admin SUSPEND/UNSUSPEND on `app.users.status` reusing the existing
  `'active'|'suspended'|'archived'` enum — no new schema/migration added.
- Active-user filtering confirmed by diff in both matching and marketplace paths:
  - `caller-call-request.ts`: adds `JOIN app.users su ON su.id=lp.user_id AND su.status='active'`
    to the instant-match candidate query.
  - `marketplace.ts`: adds `JOIN app.users mu ON mu.id=lp.user_id AND mu.status='active'`
    to the browse-listeners query.
- Real isolated-Postgres regression tests present: `tests/admin-safety-runtime-db.test.ts`,
  `tests/admin-safety-enforcement-runtime-db.test.ts`, plus `scripts/run-safety-admin-runtime-db-test.sh`.
- Commit message attests: no production/main/migration/provider/payments/voice-lifecycle/
  mobile/Home changes — confirmed by the file list above.

## 6. W37 preservation proof

- `apps/mobile/app.json`: `"package": "app.yekihast.mobile"`, `"versionCode": 8`,
  `"version": "1.0.0"` (Expo's versionName source).
- `docs/W37_ANDROID_CLOSED_TESTING_RC.md` (carried in unmodified) records the native
  values the Expo prebuild generates: compileSdk/targetSdk `36`, minSdk `24`, matching
  the mission's requirement exactly.
- `apps/mobile/src/api.ts` embeds the production API base compile-time
  (`EXPO_PUBLIC_API_BASE_URL` replaced at bundle time, source-locked fallback to
  `unique-6ff0`); `apps/mobile/eas.json` sets the same URL in both `preview` and
  `production` profiles — production API compile-time configuration preserved.
- Mobile receives Privacy/Terms/Account-Deletion/Child-Safety/support only from the API
  bootstrap legal object (no hardcoded legal URL in mobile UI) — legal/bootstrap mobile
  wiring preserved.
- W37 tests carried in unmodified: `tests/caller-mobile-closed-beta.test.ts`,
  `tests/mobile-api.test.ts`, `tests/mobile-release-config-guard.test.ts`,
  `tests/deployment-api-base-guard.test.ts`, `tests/web-admin-api-origin.test.ts`.
- Confirmed **not** committed: no `local.properties`, keystore, `.aab`, or Gradle
  build artifact is tracked anywhere in the integrated tree (`git ls-files` scan is
  empty for those patterns). There is no native `android/` folder checked in at all
  (Expo-managed source, prebuilt at build time), so there was nothing to accidentally
  commit in this integration.

## 7. W9 Home preservation proof

Byte-exact match against the approved commit, verified two ways:

- `git diff 0e09f1a HEAD -- apps/web/app/page.tsx apps/web/app/home.module.css` → **empty**.
- `git rev-parse HEAD:apps/web/public/w9/diaspora-poem-reel.mp4` and
  `git rev-parse 0e09f1a:.../diaspora-poem-reel.mp4` both resolve to the same blob
  `4e17dbb2d5db81ba90a7a50b1f9d0cc4572cc32c`.

No redesign, image replacement, copy cleanup, or layout change was made or carried in.

## 8. Billing price proof

**Source of truth is the database, not application config**, and the DB-facing
migration already carries the locked values:

- `packages/db/migrations/0003_internet_voice_transport.sql` (comment + `UPDATE
  app.pricing_plans`): sets `caller_rate_per_minute_minor=40000`,
  `listener_rate_per_minute_minor=28000`, `billing_increment_seconds=1` for
  `product=yeki_hast`, `service=human_listening`, `market=ir`, `currency=IRR`,
  `is_active=true`. Comment: *"4,000 / 2,800 / 1,200 toman therefore becomes 40,000 /
  28,000 / 12,000 IRR."* (40,000 − 28,000 = 12,000 gross — matches the mission's locked
  numbers exactly.)
- Every runtime read path (quote, authorization/hold, settlement, UI-facing bootstrap)
  reads these columns live from `app.pricing_plans` rather than hardcoding a rate:
  `services/api/src/routes/bootstrap.ts`, `bookings.ts`, `calls.ts`, `caller-bookings.ts`,
  `caller-call-request.ts`, `caller-market.ts`, `caller-quote.ts`,
  `services/api/src/lib/caller-market.ts`, `services/api/src/services/call-lifecycle.ts`,
  `internet-voice-lifecycle.ts`, `services/api/src/domain/call-authorization.ts`. None of
  these files contain a hardcoded IRR literal that could diverge from the DB.
- `packages/config/src/index.ts`'s `billingIncrementSeconds: 1` default (a
  library-level guard, not a product rate) matches the migration.
- Regression tests already assert the correct locked values at the DB/runtime layer:
  `tests/internet-voice-server-sweeper.test.ts` and `tests/session-policy-v1-2.test.ts`
  reference `40000`/`28000`.

**No economics were changed in W53** — the active implementation already matches the
mission's locked rates; this is proven above rather than re-authored.

**Integration debt found (flagged, not silently changed):**

- `packages/config/src/index.ts` — `iranBetaPricing` object hardcodes
  `callerRatePerMinuteMinor: 31_000`, `listenerRatePerMinuteMinor: 21_000`,
  `platformGrossSpreadPerMinuteMinor: 10_000`. `grep -rn "iranBetaPricing"` shows this
  constant has **zero** other references anywhere in the codebase — it is dead code left
  over from a pre-toman-repricing round, not a live economics bug (nothing reads it), but
  it is misleading and should be deleted or corrected in cleanup.
- `tests/call-authorization.test.ts` — a pure algorithm test for
  `authorizeCallStart`/`roundBillableSeconds` uses `31_000` as an arbitrary example rate,
  and its `test()` description literally says *"one minute at locked Iran caller rate
  reserves exactly 31000 IRR"*. That label is now factually stale/wrong (the locked rate
  is 40,000, per the migration above); the test itself still passes because it only
  checks the generic math, not the product config, but the description should be
  corrected or de-coupled from the "locked rate" framing to avoid confusing future
  readers. Not changed in W53 per "do not silently change" — flagged for the next
  cleanup pass alongside the dead config constant above.

## 9. Canonical API blocker diagnosis

Live-checked directly (not just re-read from the W37 doc) during this session:

```
GET https://yeki-hast-unique-6ff0.vercel.app/health       -> HTTP/1.1 404
  X-Vercel-Error: DEPLOYMENT_NOT_FOUND
GET https://yeki-hast-unique-6ff0.vercel.app/v1/bootstrap -> HTTP/1.1 404
  X-Vercel-Error: DEPLOYMENT_NOT_FOUND
```

`X-Vercel-Error: DEPLOYMENT_NOT_FOUND` is Vercel's own edge error meaning **no
deployment is currently assigned to serve this alias at all** — this is materially
different from a routing bug or stale code serving old responses (which would return
HTTP 200 from *some* build, as the retired `theta` host still does per the W37 doc).

Source-side, the routing is correct: root `vercel.json` rewrites `/health`, `/ready`,
`/v1/bootstrap` to `/api/index` and `/v1/:path*` to `/api/runtime` — this is not a
routing/domain misconfiguration.

Most likely root cause, visible in source: **both** `vercel.json` (root/API project) and
`apps/web/vercel.json` set `"git": { "deploymentEnabled": false }`. Git pushes to any
branch (including this one) will not auto-deploy either project. Combined with the large
number of near-duplicate `fix/api-canonical-legal-urls-final2`…`final10` branches visible
in the repository's branch list, this is consistent with the API project's Production
alias having lost or never received a manually-triggered deployment.

Exact non-Production-safe action needed later (**not performed in W53**): from a
workstation with Vercel CLI/dashboard access to the project backing `yeki-hast-unique-
6ff0`, run a manual deployment of the `api`-rooted project (e.g. `vercel deploy --prod`
against this exact integrated source, or the eventual post-W52 source) and confirm the
`yeki-hast-unique-6ff0.vercel.app` alias is assigned to that deployment. Then re-verify
`/health` and `/v1/bootstrap` return 200 with a W33-compatible bootstrap payload
(`legal.ready=true`, all five legal/support fields present) before any mobile upload
build is produced.

## 10. Legal-route source/runtime status

All six required routes **exist as real source files** in the integrated tree (confirmed
by direct filesystem check, not just doc claims):

- `apps/web/app/safety/page.tsx` — present (added in W33)
- `apps/web/app/safety/children/page.tsx` — present (modified in W33)
- `apps/web/app/trust/page.tsx` — present (added in W33)
- `apps/web/app/privacy/page.tsx` — present
- `apps/web/app/terms/page.tsx` — present
- `apps/web/app/account/delete/page.tsx` — present

Live-checked `https://yekihast.app/safety` during this session: HTTP 404, but with the
**application's own** CSP/security headers and a real Next.js 404 page body (not a
`DEPLOYMENT_NOT_FOUND` platform error) — confirming a genuinely live, different
deployment that simply predates W33, exactly as the W37 doc recorded. **Classified as a
deployment/runtime blocker only** — the W33 source is complete; the public site has not
been redeployed since. This is the same `deploymentEnabled: false` root cause as §9,
applied to the `apps/web` project's own alias/custom domain instead of the API project's.

## 11. Complete stale-recording assertion list

New locked product truth: **platform call recording = ON at launch, with prior clear
notice/consent** (W52 architecture pending). The following is every "recording is off /
not stored" assertion found in the integrated source, tests, and docs, categorized per
the mission's scheme. **None of these were rewritten in W53** — this is an inventory
only, per instruction not to freeze or broadly rewrite this copy yet.

**D. Public/legal copy requiring replacement (once W52 lands):**

| File | Line(s) | Note |
|---|---|---|
| `apps/web/app/terms/page.tsx` | 43–46, 73 | ToS section literally titled "تماس زنده و ضبط" (Live call and recording), says recording is "off **at launch**" — this exact phrase is the one the mission calls out as superseded |
| `apps/web/app/privacy/page.tsx` | 38–39 | Privacy policy: platform recording off; server does not terminate/decrypt/record/store audio |
| `apps/web/app/safety/page.tsx` | 25 | Safety page bullet |
| `apps/web/app/safety/children/page.tsx` | 46 | Child safety page |
| `apps/web/app/trust/page.tsx` | 23–24, 48 | Trust page, twice |
| `apps/web/app/faq/page.tsx` | 17 | FAQ Q&A: "Is the call recorded? No." |
| `apps/web/app/talk/page.tsx` | 485 | In-call screen copy |
| `apps/web/app/booking/call/page.tsx` | 392 | Booking/call screen copy |
| `apps/mobile/App.tsx` | 347 | In-app banner copy |
| `apps/mobile/src/CallerClosedBetaScreen.tsx` | 496 | Closed-beta screen note |

**C. Tests requiring replacement (currently lock the old copy as a pass condition):**

| File | Line(s) | Note |
|---|---|---|
| `tests/w33-public-legal-trust.test.ts` | 22, 23, 31, 56, 71 | Multiple `assert.match` calls requiring the exact Persian "recording off" strings to be present in Terms/Trust/FAQ source |
| `tests/store-submission-readiness.test.ts` | 43 | Asserts the same exact string is present for Store Data-Safety copy |

**A. Must patch immediately after W52 (implementation-adjacent references, not just
copy):**

| File | Line(s) | Note |
|---|---|---|
| `docs/STORE_RELEASE_CURRENT.md` | 36 | Feeds the actual Play Data Safety questionnaire — directly wrong once recording ships, highest real-world consequence if left stale |
| `docs/W37_ANDROID_CLOSED_TESTING_RC.md` | 38, 118 | Lists "platform-recording-off" as a tested source truth and a manual QA verification step for the next Android RC pass |

**B. Historical report only (point-in-time, no action needed beyond awareness):**

- The rest of `docs/W37_ANDROID_CLOSED_TESTING_RC.md`, `docs/W33_PUBLIC_LEGAL_TRUST_HARDENING.md`,
  and other dated `docs/*_STATUS.md`/`*_READINESS.md` files describing the pre-W52 state
  as it stood on their respective dates. These should not be edited; they are dated
  records, not live truth.

A broader `grep -rli "record"` also matches ~50 files containing generic uses (database
"record", call "record" as in call-history row, admin "records") unrelated to the
recording-consent claim; those were reviewed and excluded from the list above.

## 12. Tests/build results

**Environment, stated plainly:** this sandbox is Windows/Git-Bash with Node v24.19.0
(the repo pins `engine-strict=true` + `node@22.x`; W37's own doc was verified under the
exact pinned `Node 22.23.1`/`npm 10.9.8`/Java 17/Gradle 9.3.1/Android SDK 36 toolchain).
No `nvm`, Java, Gradle, Android SDK, Docker, or PostgreSQL is available here. A first
`npm install` attempt failed outright (Windows `EPERM` on `rmdir` under the RN/Expo
native subtree, an `esbuild` postinstall unable to spawn `cmd.exe` under Git Bash); a
second attempt with `--engine-strict=false --ignore-scripts` succeeded (9 minutes, 791
packages) and unblocked real execution.

**Typecheck — actually run, PASS:** `npm run typecheck --workspaces --if-present`
exited 0 with no errors across all 7 workspaces (`admin`, `mobile`, `web`, `api`, `db`,
`domain`, `types`).

**Full test suite — actually run:** `npm test` (`node --test` over all 715 tests):
**708 pass, 5 fail, 2 skipped.** Every failure was individually root-caused, not just
counted:

1. + 2. **Two "Home freeze" guard tests** (`tests/internal-owner-test-mode.test.ts`,
   `tests/w33-public-legal-trust.test.ts`) — the real, fixed issue from §4. First run
   showed `actual '597a8797…' !== expected 'e6074b4b…'` (the pre-reel W33 baseline).
   After updating the pinned hashes to the W9 reel's own blobs (§4), the same assertion
   now shows `actual '597a8797…' !== expected 'a4e72b96…'` — i.e. the **expected** side
   is now provably correct (it's the exact blob hash of the approved reel commit,
   independently verified via `git rev-parse 0e09f1a:<path>` in §7), and the **actual**
   side is unchanged because of finding 3 below. The fix is source-level and verifiable
   by `git` directly; it does not depend on this sandbox rendering the test green.
3. **`readiness pins migration 0006 to its exact SHA-256`** and **`readiness pins the
   exact liveness-aware migration bytes`** — computes SHA-256 of the on-disk migration
   file and expects it to match the literal hash baked into `api/index.ts`. Root-caused
   directly: `git show HEAD:packages/db/migrations/0006_internet_voice_server_sweeper.sql
   | sha256sum` → `46c8bc4e…`, which **exactly matches** the hardcoded expectation in
   `api/index.ts`. `sha256sum` on the same path in the working tree instead gives
   `68bcc07b…`. `file` confirms the working-tree copy has CRLF line endings although the
   committed git object is pure LF (verified byte-for-byte with `git cat-file -p` +
   `grep -c $'\r'` → 0). This is a Windows checkout artifact, not a source defect.
4. **`synthetic listener stays distinguishable and normal gates remain in source`** —
   fails a regex requiring a literal `\n` inside `services/api/src/routes/internal-owner-
   test.ts`; the working-tree copy of that file has the same CRLF corruption as #3.

Root cause for 3–4, and for why 1–2 can't be proven green *in this sandbox*: `git config
core.autocrlf` is `true` at the machine/global level (`C:\Program Files\Git\etc\gitconfig`).
I set it to `false` locally and force-re-checked-out the affected files — no change. I
also tried a temporary `.gitattributes` with `* text=auto eol=lf` — no change either. The
committed objects are confirmed pure-LF via `git cat-file`; something below git's own
config layer on this specific Windows/MSYS box is still smudging these files to CRLF on
checkout, and I could not override it. **This is a pre-existing property of this sandbox
checkout, not something introduced by W53, and it affects source files identically
whether or not any integration happened** — I did not attempt to "fix" it by rewriting
`page.tsx`, `home.module.css`, the migration file, or `internal-owner-test.ts` in place,
since doing so for sandbox convenience would itself corrupt the Home byte-identity proof
in §7. On any standard LF checkout (GitHub Actions, a correctly configured Linux/macOS
box, or a Windows box where autocrlf genuinely honors `false`), all 5 of these are
expected to pass, because every "expected" value the tests check against is proven above
to be the literal git-committed content.

Also carried forward as corroborating (not re-executed) evidence:

- **W36's own commit message** attests: "Full suite + typechecks + admin/web builds
  green; isolated-DB runtime verification green" — for the exact `631fa74` diff.
- **`docs/W37_ANDROID_CLOSED_TESTING_RC.md`** (unmodified, dated 2026-09-13) records,
  under the correctly pinned toolchain: full repository suite PASS (704/704), mobile
  typecheck PASS, production Android export PASS, native `bundleRelease` PASS — for the
  exact `31f683d` diff.

**Not executed in this session** (this sandbox has no PostgreSQL 16, Java, Gradle, or
Android SDK): W36's isolated-Postgres runtime tests (already gated behind
`test:safety-runtime-db`, a separate script, and skipped by the main `npm test` run
above — consistent with the "2 skipped" count), and W37's native Android
build/bundletool/on-device checks. **Recommended next step:** re-run
`npm ci && npm run validate:foundation && npm test && npm run typecheck` for this exact
branch on a properly provisioned Linux CI box with PostgreSQL 16 (and, for the Android
guards, Java 17/Gradle/Android SDK 36) to get a fully green, environment-artifact-free
confirmation — expected result is 715/715 given the root-causing above.

## 13. Remaining blockers

1. Canonical API alias `yeki-hast-unique-6ff0.vercel.app` serves no deployment
   (`DEPLOYMENT_NOT_FOUND`) — §9.
2. Public site `yekihast.app` is live but predates W33; `/safety`, `/safety/children`,
   `/trust` 404 there until redeployed — §10.
3. No Play upload-signing keystore available; W37's local AAB is debug-signed only
   (per `docs/W37_ANDROID_CLOSED_TESTING_RC.md`) — unchanged by W53.
4. W52 call-recording architecture/consent flow not yet designed or implemented — blocks
   closing out the category A/D items in §11.
5. Two integration-debt items found in §8 (dead `iranBetaPricing` config, stale test
   description) — low risk, not yet cleaned up.
6. This sandbox's own Windows checkout silently converts several committed LF files to
   CRLF, which cannot be overridden by `core.autocrlf`/`.gitattributes` here (§12) — this
   pre-exists W53, affects any contributor on this exact machine image, and only shows up
   as false test failures on raw-byte/hash checks. Worth a root-cause investigation
   outside W53's scope; a proper Linux CI run is unaffected.
7. W36's isolated-Postgres runtime tests and W37's native Android/bundletool checks were
   not re-executed here (no PostgreSQL 16/Java/Gradle/Android SDK in this sandbox) — rely
   on their own prior verified runs (§12) until CI reconfirms.

## 14. Exact handoff for W52 recording implementation

- Implement the actual recording capture/consent/storage architecture first (out of
  scope for W53 by design).
- Once implemented, the change should land as one coordinated commit/PR that:
  - Replaces the exact strings listed in §11 category **D** (10 UI copy sites across
    web+mobile) with accurate, consent-appropriate language.
  - Updates §11 category **C** tests (`tests/w33-public-legal-trust.test.ts`,
    `tests/store-submission-readiness.test.ts`) to assert the *new* copy instead of
    deleting coverage.
  - Updates §11 category **A** docs (`docs/STORE_RELEASE_CURRENT.md`'s Data Safety
    guidance, `docs/W37_ANDROID_CLOSED_TESTING_RC.md`'s QA checklist item) so the next
    Android RC pass and the eventual Play Data Safety filing are accurate.
  - Leaves category **B** historical docs untouched.
- Do this as a single pass across both copy and tests together — the mission's own
  warning applies here too: don't let source and tests drift by patching one without
  the other.

## 15. Exact handoff for Safe Preview (W44)

No W44 branch, commit, or doc exists in this repository yet — this is a forward-looking
handoff based on what W53 found, not a report on completed work.

Both live blockers in this RC (§9, §10) are deployment/alias problems, not source gaps —
the actual source (legal pages, Home reel, safety admin) is already correct and merged
into this branch. A "Safe Preview" milestone should therefore:

1. Use a **Preview** (not Production) Vercel deployment of this exact `w53` branch for
   both the API project and `apps/web`, so the fix is "deploy to Preview" rather than
   "fix source" — consistent with W53's no-Production-deploy restriction.
2. Gate that Preview with Vercel's built-in deployment protection (password or Vercel
   Authentication) so stakeholders can review the real `/safety`, `/trust`,
   `/safety/children` pages and the integrated Home reel without exposing the
   still-broken canonical Production alias to the public.
3. Verify against the Preview URL, not `yeki-hast-unique-6ff0.vercel.app` or
   `yekihast.app`, until §9/§10 are resolved for Production.

## 16. Exact handoff for final signed Android AAB

Unchanged from W37's own conclusion, reconfirmed here — do not produce a final upload
AAB until, in order:

1. §9 (canonical API) and §10 (public legal routes) are resolved and independently
   re-verified live.
2. The W52 recording decision is implemented and §11 category A/D/C items are closed, so
   the shipped app's in-app copy and Data Safety declaration are truthful at the moment
   of upload.
3. A real Google Play upload-signing keystore is provided through an approved secure
   path (`docs/W37_ANDROID_CLOSED_TESTING_RC.md`: `RELEASE_SIGNING_OWNER_ACTION_REQUIRED`)
   — W53 did not create, request, or handle any signing credential.

Once all three are true, rebuild from this integrated source (or its post-W52
descendant), produce a release-signed vc8+ AAB, and re-run the W37 verification
checklist (bundletool identity, artifact API-origin scan, on-device smoke test) against
the now-live canonical API before Closed Testing upload.
