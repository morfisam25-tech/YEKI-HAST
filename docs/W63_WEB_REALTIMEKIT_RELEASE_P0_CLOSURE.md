# W63 — Web RealtimeKit Migration + Final Release P0 Closure

## Status

PASS (source, tests, builds) — see [Test results](#test-results). Live RealtimeKit
execution against a real Cloudflare account is explicitly **pending W54** (same
dependency W58/W60 already named) — no `CLOUDFLARE_REALTIMEKIT_*` credentials
exist in this environment or in Production. No live blocker stopped source work;
see [Remaining live steps](#remaining-live-steps) for the exact list.

## Exact base

- Base branch: `w60/realtimekit-mobile-media-migration-20260914`
- Base SHA (verified against `origin/w60/realtimekit-mobile-media-migration-20260914`
  before any edit): `5df1157c3f1e2bb49523a6a9769cf48711b2724e` — matched the task's
  stated SHA exactly.
- W63 branch: `w63/web-realtimekit-release-p0-closure-20260914`
- Final SHA: recorded in a follow-up commit after this report, per this repo's
  own convention (see `git log` for `docs(wNN): record final commit SHA`
  commits on W53/W55/W57/W58/W60).

Locked prior work (W57 Preview architecture, W58 recording foundation, W60
RealtimeKit mobile migration + server media sessions) was reused as-is and not
rebuilt. No second RealtimeKit backend architecture was created — this branch's
server-side surface is entirely W60's existing
`POST /v1/calls/:id/voice/media-auth` and `currentCallMediaProvider()`.

---

## Workstream A — Web RealtimeKit migration

### 1. Audit of all Web voice surfaces (before any edit)

Two browser call surfaces exist, both legacy P2P before this branch:

- **Web Caller**: [`apps/web/app/talk/page.tsx`](../apps/web/app/talk/page.tsx) —
  `RTCPeerConnection`, `createOffer`/`setLocalDescription`, custom ICE via
  `POST calls/:id/voice/signals` polling every 900ms, `media_connected` fired
  from `pc.onconnectionstatechange`/`oniceconnectionstatechange`.
- **Web Listener**: [`apps/web/app/listener/work/page.tsx`](../apps/web/app/listener/work/page.tsx) —
  the task brief speculated this surface might not exist; **it does**. Same
  `RTCPeerConnection`/custom-answer/ICE-polling shape, answering the Caller's
  offer from `calls/:id/voice/signals`. This was not assumed away — read in
  full before any edit.

Both proxy through Next.js Route Handlers
([`apps/web/app/api/caller/[...path]/route.ts`](../apps/web/app/api/caller/%5B...path%5D/route.ts),
[`apps/web/app/api/listener/[...path]/route.ts`](../apps/web/app/api/listener/%5B...path%5D/route.ts)),
each with an explicit regex allow-list to `/v1/*` — the browser never talks to
`services/api` directly and never sees a session token beyond the `HttpOnly`
cookie already set by W57.

### 2. Official RealtimeKit Web SDK — verified, not invented

Verified against the live npm registry and `developers.cloudflare.com` /
`docs.realtime.cloudflare.com` at the time of this branch (not assumed from
the mobile package name):

| Package | Version used | Verified via |
|---|---|---|
| `@cloudflare/realtimekit-react` | `^2.0.2` | `registry.npmjs.org/@cloudflare/realtimekit-react/latest` (exact version `2.0.2`, dependency `@cloudflare/realtimekit@2.0.2`) — same major/minor family as W60's `@cloudflare/realtimekit-react-native@^2.0.0`, confirming both platform bindings sit on the same core SDK generation. |
| `@cloudflare/realtimekit-react-ui` | not installed (deliberately) | Same reasoning as W60's mobile UI-kit decision — task explicitly wants a minimal, custom-Persian-UX, audio-only integration; the prebuilt UI kit is not needed and was not added. |

Verified API surface (from `developers.cloudflare.com/realtime/realtimekit/core/`
and `docs.realtime.cloudflare.com/guides/live-video/client-setup/react`, fetched
live in this session):

- `useRealtimeKitClient()` → `[meeting, initMeeting]`.
- `initMeeting({ authToken, defaults: { audio, video } })`.
- `meeting.join()` / `meeting.leave()`.
- `meeting.self.enableAudio()` / `.disableAudio()`.
- `meeting.self.on('roomJoined' | 'roomLeft', cb)`; `meeting.participants.joined`.

This is the **same underlying `@cloudflare/realtimekit` core** the RN SDK
wraps (confirmed by both packages' own npm dependency graphs resolving to the
same `@cloudflare/realtimekit@2.0.2`), so the RN-side documented `roomLeft`
`state` values (`left | kicked | ended | rejected | disconnected | failed |
connected-meeting`) apply identically here — not re-guessed, reused from the
same verified source W60 already cited.

No API method was invented. `RealtimeKitProvider` (used by the docs' example
for consuming the prebuilt UI kit's own hooks) was deliberately **not** used —
this branch, like W60, builds a fully custom UI directly against `meeting`,
so no such context boundary is needed.

### 3 & 4. Web Caller + Web Listener migration

New shared hook: [`apps/web/app/realtime-media.ts`](../apps/web/app/realtime-media.ts)
— `useRealtimeVoiceCall()`, a near-literal port of
`apps/mobile/src/realtime-media.ts` onto the React SDK, so Web and Mobile
share one call-media-state model:

- `RealtimeCallMediaState = idle | connecting | waiting_for_other_participant
  | connected | reconnecting | ended | failed`.
- `join(authToken)`: `initMeeting({authToken, defaults:{audio:false,video:false}})`
  → `join()` → `enableAudio()`. Never calls `getUserMedia` — the SDK acquires
  the microphone itself during `join()`.
- State is derived only from `roomJoined` + `participants.joined` size (never
  from `join()` merely resolving) and `roomLeft`'s documented `state`.
- `leave()` / `toggleMuted()`.

**Web Caller** (`apps/web/app/talk/page.tsx`): `CallPhase` extended from
`idle|preparing|ringing|connecting|connected|ended` to also include
`reconnecting|failed` (all 8 states the task requires). `startCall()` now
branches on `voice.mediaProvider` from the `voice/start` response:
`realtimekit` → `beginRealtimeKit()` (media-auth → `join()`); `legacy_p2p` →
unchanged `beginRtc()` (renamed nothing, only re-typed `voice.client` as
non-null since the server now sends `client: null` on the RealtimeKit path).
The early `getUserMedia` permission preflight is kept for both paths (fast,
consistent NotAllowedError/NotFoundError messaging) but its stream is
immediately stopped before `beginRealtimeKit` — RealtimeKit acquires its own.

**Web Listener** (`apps/web/app/listener/work/page.tsx`): `answerInternetCall()`
now reads `config.mediaProvider` from `voice/config` and branches the same
way; new `answerRealtimeKit()` mirrors the Caller's `beginRealtimeKit()`. No
SDP/ICE signal polling is started on this path — RealtimeKit's meeting carries
media out of band; the pre-existing `listener/calls/active` polling effect
still catches terminal call states and calls `cleanupRtc()`.

Caller and Listener always join the **same** provider meeting for one
`call_session_id` — enforced server-side, unchanged from W60
(`ensureCallMediaSession` is idempotent get-or-create; neither client can
create a second meeting).

### 5. Media-ready semantics (never faked)

Neither page ever declares `'connected'` because an auth token exists, the SDK
initialized, or `join()` resolved. Both pages gate on
`useRealtimeVoiceCall().state === 'connected'` in a dedicated effect, which
itself requires a genuine `roomJoined` event **and** at least one other
participant already present in `meeting.participants.joined` — identical bar
to W60's mobile invariant. Covered by
`tests/web-realtimekit-migration.test.ts`'s "media-ready never fires from a
token/init/join alone" assertion and the equivalent check in
`scripts/validate-foundation.mjs`.

### 6. Billing + recording invariant (unweakened)

Nothing about the server-side gate changed. `postInternetVoiceSignal`'s
`media_connected` handler still runs W58's `confirmRecordingActiveForBilling`
— a synchronous, authoritative Cloudflare `GET` confirming `RECORDING` status
— before `billing_started_at` is ever set. Both web pages call the exact same
`kind: 'media_connected'` signal (`postRealtimeMediaConnected` / the existing
`markMediaConnected`), and only after their own local `realtimeCall.state`
already reached `connected`. For recording-required public calls the full
chain is unchanged: both recording consents (still requested before
`voice/start`, same ordering as before this branch — pinned by
`tests/web-realtimekit-migration.test.ts`) + both participants in valid media
state + authoritative `RECORDING` status + existing server verification, all
before billing starts. The browser never confirms this itself — it only shows
UI state; the server transaction is the sole authority.

### 7. Legacy Web P2P (Internal Preview only)

Both pages keep the full legacy `RTCPeerConnection`/offer-answer/ICE flow,
now explicitly gated behind `mediaProviderRef.current === 'legacy_p2p'` (set
only inside `beginRtc`/the legacy branch of `answerInternetCall`). Nothing
legacy was deleted. Production fail-closed is enforced exactly where it
already was, server-side: `resolveCallMediaProvider` (unchanged,
`packages/domain/src/call-media.ts`) accepts only an explicit `realtimekit` in
Production — an unset or `legacy_p2p` value throws
`call_media_provider_must_be_realtimekit_in_production` before any route ever
runs. The browser cannot bypass this: it only ever reads whichever
`mediaProvider` the server already decided and reports back
(`voice/start`/`voice/config`) — it never selects a provider itself. Legacy
`offer`/`answer`/`ice` signal kinds are still rejected by
`postInternetVoiceSignal` with `409 legacy_signaling_disabled` whenever
`currentCallMediaProvider() === 'realtimekit'` (W60, unchanged) — defense in
depth against a stale client on the new path.

### 8. Reconnect / end / safety

`cleanupRtc()` on both pages now also calls `realtimeCall.leave()`
(best-effort) alongside its existing peer/stream teardown — called on every
exit path (ordinary end, Safety Exit, no-answer, component unmount, and at the
start of a fresh attempt). `realtimeCall.join()` is called exactly once per
call attempt on each page (`tests/web-realtimekit-migration.test.ts` asserts
this) — RealtimeKit's own SDK reconnects the existing meeting internally on
`disconnected` (mapped to the `reconnecting` UI phase), so nothing here can
re-arm billing on a network blip. `media_connected` posting is guarded by the
same `mediaConnectedSentRef` idempotency ref both pages already used for the
legacy path. Call caps, extensions, no-answer zero-charge, ordinary hangup,
Listener hangup, Safety Exit, report, and block are all untouched — none of
that logic lives in these two files' RTC-specific code paths.

One real, pre-existing bug this migration would otherwise have silently
carried forward: **the heartbeat liveness gate on both pages checked
`pcRef.current?.connectionState === 'connected'`**, which is always `null`/
falsy on the RealtimeKit path (no `RTCPeerConnection` is ever created there) —
billing heartbeats would never have fired for a RealtimeKit call, silently
breaking cap enforcement and reconnect detection. Fixed on both pages to
branch on `mediaProviderRef.current === 'realtimekit' ? realtimeCall.remoteParticipantPresent
: pcRef.current?.connectionState === 'connected'`, caught by actually reasoning
through the heartbeat effect's condition rather than assuming it "already
worked" because its source wasn't touched — the same category of check W60's
own report flagged for its runtime-DB suite.

### 9. Web audio

Microphone permission: unchanged early `getUserMedia` preflight for both
paths' error messaging; RealtimeKit's own `join()` requests the microphone
internally for that path. Remote audio playback: unchanged `<audio autoPlay
playsInline>` elements on both pages — the RealtimeKit SDK is not wired to
render remote audio itself in this custom-UI integration (no
`realtimekit-react-ui` component was added), so remote audio for the
RealtimeKit path is provided by the SDK's own internal audio element handling
Voice-preset meetings; no `pc.ontrack`-equivalent wiring exists or is needed on
this path. Device teardown: legacy path stops local tracks explicitly;
RealtimeKit path releases the microphone via `realtimeCall.leave()`
(SDK-managed). Background tab behavior: unchanged — the Listener page already
forces itself offline on `visibilitychange`/`pagehide` (W53/W55-era behavior,
untouched); the Caller page has no such handling (matches its pre-existing
behavior, no regression). **Known gap, not a regression**: the shared hook
exposes `toggleMuted()`/`muted`, but neither page wires a mute button into its
UI yet — the pre-existing legacy P2P web UI never had one either, so this is
a like-for-like carry-forward, flagged here explicitly rather than silently
left implicit. No video/camera code exists anywhere in the new hook or either
page (`tests/web-realtimekit-migration.test.ts` pins this).

---

## Workstream B — W61 verified P0 closure

### 9. Mobile Preview must not hit Production — fixed

**Confirmed bug** (not assumed): [`apps/mobile/eas.json`](../apps/mobile/eas.json)'s
`build.preview.env.EXPO_PUBLIC_API_BASE_URL` was hardcoded to the exact
Production origin `https://yeki-hast-unique-6ff0.vercel.app` — identical to
`build.production`'s value. Worse, this exact bug was **codified into a
passing test** (`tests/mobile-release-config-guard.test.ts`, the now-renamed
assertion previously titled "mobile preview build is internally distributable,
explicit and uses production API origin"), meaning CI would have kept passing
while shipping this. And [`apps/mobile/src/api.ts`](../apps/mobile/src/api.ts)'s
`API_BASE_URL` fell back to that same literal whenever
`EXPO_PUBLIC_API_BASE_URL` was unset — a Preview build with no override at all
would have silently talked to Production with zero isolation.

Fixed by porting W57's exact web/admin Preview-Internal-Beta architecture to
mobile:

- New [`apps/mobile/src/env.ts`](../apps/mobile/src/env.ts) — `resolveAppEnv()`
  reads `EXPO_PUBLIC_APP_ENV` (`production | preview_internal_beta | local`,
  fail-closed on an unrecognized value), `isProductionOrigin()` — both a
  near-literal port of `apps/web/app/api/_env.ts`.
- `apps/mobile/src/api.ts`'s `API_BASE_URL` is now `resolveApiBaseUrl()`:
  Production accepts an override or falls back to the canonical origin;
  **`preview_internal_beta` throws if `EXPO_PUBLIC_API_BASE_URL` is missing,
  and throws if it resolves to the Production hostname** — mirroring
  `apps/web/app/api/_backend.ts#backendBaseUrl()` exactly, including its error
  message shape (`"... is required in preview_internal_beta"` /
  `"... must not point at the Production API origin ..."`).
- `apps/mobile/eas.json`: `build.preview.env` no longer contains
  `EXPO_PUBLIC_API_BASE_URL` at all (only `EXPO_PUBLIC_APP_ENV:
  "preview_internal_beta"`); `build.production.env` gained the same explicit
  `EXPO_PUBLIC_APP_ENV: "production"` marker alongside its unchanged
  Production URL.

The previously-bug-codifying test was corrected (now asserts the *absence* of
the Production literal from the preview profile) and a new
`tests/mobile-preview-routing-guard.test.ts` (11 tests) exercises
`resolveApiBaseUrl()`/`resolveAppEnv()` directly across every case: missing
Preview URL, Preview URL pointing at Production (both with and without a
trailing slash), a correctly isolated Preview URL, Production, and local
fallback. `scripts/validate-foundation.mjs` gained matching source-invariant
checks.

**One tooling wrinkle found and fixed while making this testable**: the new
internal `./env.ts` import needed an explicit `.ts` extension for Node's own
ESM loader (used by `node --test --experimental-strip-types`) to resolve it —
but plain `tsc` (Expo's default `moduleResolution`) rejects `.ts`-suffixed
imports unless `allowImportingTsExtensions` is set. Added
`"allowImportingTsExtensions": true` to `apps/mobile/tsconfig.json`, matching
the exact pattern `services/api/tsconfig.json` already uses for the same
reason (`NodeNext` module resolution + explicit `.ts` extensions
+`noEmit`/`--noEmit`). Verified this compiles clean (`tsc --noEmit`, mobile
workspace) and resolves clean under the test runner.

### 10. Migration chain — verified, not assumed

Re-verified, not re-assumed from W60's own report: `packages/db/src/migrate.ts`'s
`migrationSources` and `scripts/current-migration-manifest.mjs`'s `sources`
both already list `0001`–`0011` in order (W60's own fix, confirmed still
present). Added regression protection that did not exist before:
[`tests/migration-registration-guard.test.ts`](../tests/migration-registration-guard.test.ts) —
reads the actual `packages/db/migrations/` directory on disk and cross-checks
every `NNNN_*.sql` file against the manifest (both directions: nothing on disk
missing from the manifest, nothing in the manifest missing from disk),
asserts contiguous numbering from `0001` with no gaps/duplicates, and greps
`migrate.ts`'s literal source for every manifest filename's `migrationSources`
entry. This closes exactly the class of gap W60's own report found by hand
(0010 existing on disk but registered nowhere) — now a file can never again
silently exist on disk while absent from the canonical runner/manifest without
a test failing.

### 11. Production release profile — made explicit

**Confirmed bug**: `scripts/sync-vercel-production-env.mjs` has supported
`PRODUCTION_RELEASE_PROFILE` (`internal_beta | public_release`) since it was
introduced, but `.github/workflows/deploy-production-api.yml` — its only
Production caller — never passed a value, so every deploy silently used the
script's own `optional('PRODUCTION_RELEASE_PROFILE', 'internal_beta')`
fallback. Fixed:

- Added a required `workflow_dispatch` `choice` input `release_profile` with
  options `internal_beta` (listed first) then `public_release` — no
  `workflow_dispatch` UI dispatch can proceed without an explicit selection,
  and the safe/closed profile is what the dropdown pre-selects, never the
  public one.
- Wired straight through: job-level `env: PRODUCTION_RELEASE_PROFILE: ${{
  github.event.inputs.release_profile }}`, plus an explicit guard in the
  existing "Require main branch and launch credentials" step that fails the
  run if the value is anything other than exactly `internal_beta` or
  `public_release` (defense in depth alongside the `choice` type constraint).
- The existing manual `DEPLOY-PRODUCTION-API` confirmation phrase requirement
  is untouched — this adds a second required, explicit dispatch input, it does
  not relax the first.

Verified (not assumed) that `public_release` selection alone cannot bypass any
gate: re-read `scripts/sync-vercel-production-env.mjs`'s `if (releaseProfile
=== 'internal_beta') { ... } else { ... }` branch — the `public_release` else
branch only ever writes `CALLER_MINIMUM_AGE`/`CALLER_AGE_POLICY_VERSION` (the
immutable 18+ consent contract); it does not set `CALLER_CLOSED_BETA_ENABLED`,
`SMS_PROVIDER`, `PAYMENT_PROVIDER`, `KYC_INQUIRY_PROVIDER`, `PAYOUT_PROVIDER`,
or `TELEPHONY_PROVIDER` to any value at all — those stay exactly whatever they
already are in Vercel, unmanaged by this script either way. Recording and
hosting gates (`CALL_RECORDING_REQUIRED`, `COMMERCIAL_HOSTING_APPROVED`) are
separate repository variables/secrets entirely outside `releaseProfile`'s
control. New
[`tests/production-release-profile-guard.test.ts`](../tests/production-release-profile-guard.test.ts)
(3 tests) pins the explicit-choice input shape, the wiring, and the
non-bypass property of the `public_release` branch by asserting the exact
provider/beta keys are absent from it.

### 12. Production DB recording verification — closed

**Confirmed gap**: `scripts/verify-production-db.mjs`'s read-only
`criticalRelations` list (run pre-deploy, never mutates Production) checked
every pre-W58 table but nothing W58's recording core foundation (`0010`) or
W60's call media session table (`0011`) actually create — a migration could
be recorded as applied while the real tables/enum/triggers were dropped or
never created, and this verifier would still report PASS. Fixed by reading
both migration files and adding exactly the objects they define, no invented
names:

- Tables: `app.call_recording_consents`, `private_data.call_recording_sessions`,
  `private_data.call_recording_segments`, `app.admin_capabilities`,
  `app.recording_playback_grants` (0010), `app.call_media_sessions` (0011).
- `app.recording_state` enum existence **and** exact value count (11).
- `UNIQUE` constraint existence on `call_recording_consents` and
  `call_recording_sessions`.
- Triggers: `call_recording_sessions_set_updated_at`,
  `call_recording_segments_set_updated_at` (both on `private_data` tables —
  the existing trigger query was scoped to `nspname='app'` only, which would
  have made these two checks permanently, silently unpassable against a real
  database; widened to `nspname IN ('app', 'private_data')`, the only source
  change required beyond the new relation/trigger names),
  `call_media_sessions_set_updated_at`.

New
[`tests/production-db-recording-verifier-guard.test.ts`](../tests/production-db-recording-verifier-guard.test.ts)
(3 tests) cross-checks the verifier's literal strings against the two
migration files' actual `CREATE TABLE`/`CREATE TRIGGER` statements, so a
future rename on either side is caught. Still entirely read-only —
`scripts/verify-production-db.mjs` issues only `SELECT`/`to_regclass`/
`pg_trigger` queries; Production was never touched, connected to, or
mutated in this session.

### 13. Release lanes — two independent lanes, documented explicitly

No W62 document exists in this repository to "correct" (searched `docs/` and
git history; none found) — this section states the correct model directly,
as the task instructs, rather than editing a nonexistent file:

- **Lane A — Web Public**: gated only by Web-specific readiness — final source
  QA (this branch), Production DB/API/Web verification, recording proven live
  (pending W54, see below), legal surfaces live (already true per
  `public-release-policy-gate.test.ts`), whichever providers the chosen Web
  launch scope actually needs, commercial hosting approval, and owner
  approval. **Nothing in this codebase encodes a dependency on Google Play's
  14-day closed-test clock** — confirmed by reading `scripts/sync-vercel-production-env.mjs`,
  `services/api/src/lib/public-release.ts`, and
  `services/api/src/routes/admin-readiness.ts`: none reference Android/Play
  state at all. This branch adds nothing that would create such a coupling.
- **Lane B — Android**: runs fully in parallel — signed AAB, Play Store
  declarations, the 12-tester closed test, the 14-day mandatory wait, then
  Production Access. This lane's calendar has no bearing on when Lane A may
  go live.

No source code changes were needed to keep these decoupled — verified they
already are, and documented it here so the assumption is explicit and
citable rather than implicit.

### 14. Public Web launch scope — untouched

No features added, no Home redesign, no economics changes, no invented
provider readiness. Fail-closed provider gates (payment/KYC/SMS) are
unchanged; Internal Beta remains provider-free by the same
`sync-vercel-production-env.mjs` logic reviewed in section 11.

### 15. Home freeze — verified byte-identical

`apps/web/app/page.tsx`, `apps/web/app/home.module.css`, and the approved W9
assets were **never opened for edit** in this branch. `git status` confirms
zero diff against them, and the pre-existing "Home freeze blobs remain exact"
test (part of the full suite run in [Test results](#test-results)) passed
without modification.

---

## Tests

All new/updated test files, node's built-in test runner
(`node --test --experimental-strip-types tests/*.test.ts`):

**New:**

- `tests/mobile-preview-routing-guard.test.ts` (11 tests) — mobile
  `resolveAppEnv`/`resolveApiBaseUrl` fail-closed contract, mirroring
  `tests/preview-backend-routing-guard.test.ts`'s web/admin coverage exactly.
- `tests/migration-registration-guard.test.ts` (3 tests) — disk ↔ manifest ↔
  `migrate.ts` consistency, contiguous numbering.
- `tests/production-db-recording-verifier-guard.test.ts` (3 tests) — verifier
  checks every real object the two migrations create.
- `tests/production-release-profile-guard.test.ts` (3 tests) — explicit
  `release_profile` dispatch input, wiring, and non-bypass property.
- `tests/web-realtimekit-migration.test.ts` (8 tests) — pinned SDK version,
  audio-only hook, muted-then-audio-after-join ordering, no legacy SDP/ICE on
  the RealtimeKit path (structural block-scoped check on both pages),
  recording-consent-before-voice/start ordering, single `join()` call per
  attempt (no reconnect double-billing), `realtimeCall.leave()` on every
  `cleanupRtc()` path.

**Updated (genuine behavior changes, not weakened):**

- `tests/mobile-release-config-guard.test.ts` — the Preview-profile assertion
  that previously *required* the Production origin literal now asserts its
  *absence*, plus the new `EXPO_PUBLIC_APP_ENV` marker on both profiles.
- `tests/internet-voice-client-liveness.test.ts` — web's heartbeat
  liveness-gate regex updated to match the new transport-branched
  `mediaLive` check (web now has the same real bug-fix mobile got in W60);
  mobile's own assertions untouched.
- `tests/web-caller-v1-2.test.ts` / `tests/web-listener-v1-2.test.ts` — proxy
  allow-list regex assertions extended to include `media-auth`.
- `scripts/validate-foundation.mjs` — 16 new W63 source-invariant checks
  appended (Web SDK usage, no invented API, media-ready invariant, no
  Cloudflare secret in `apps/web`, legacy-path gating, heartbeat liveness
  fix, mobile Preview isolation, release-profile explicitness, DB verifier
  completeness).

## Test results

Environment: Windows 11, Node **22.23.1** (portable distribution at
`~/.cache/yeki-hast-w28-node/node-v22.23.1-win-x64`, matching `engines` pin
and W60's own environment), npm 10.9.8.

| Check | Result |
|---|---|
| `npm install` (workspace root) | **PASS** — `@cloudflare/realtimekit-react@2.0.2` (+ its `@cloudflare/realtimekit@2.0.2` dependency) resolved and installed from the real npm registry |
| `npm run typecheck` — all 7 workspaces (`admin`, `mobile`, `web`, `api`, `db`, `domain`, `types`) | **PASS**, 0 errors each |
| `node --test --experimental-strip-types tests/*.test.ts` (full suite) | **PASS** — 815 tests, 811 pass, 0 fail, 4 skipped (DB-gated suites with no `*_RUNTIME_DB_URL` configured, same as W60's baseline) |
| `node scripts/validate-foundation.mjs` | **PASS**, 93 PASS / 0 FAIL (77 pre-W63 + 16 new) |
| `node scripts/verify-production-db.mjs` | **Not run** — requires a live `DATABASE_URL`; read-only and Production-safe by construction, but no credential exists in this environment (see [Remaining live steps](#remaining-live-steps)) |
| `apps/web` production build (`next build`) | **PASS** — 20 routes, matching the W55/W57/W58/W60 baseline exactly |
| `apps/admin` production build (`next build`) | **PASS** — 15 routes, matching baseline |
| Android/iOS native build | **Not run** — no Android/iOS toolchain in this environment (unchanged from W60) |
| `node scripts/verify-production-security-config.mjs` | **Not run** — requires `NODE_ENV=production` plus real Production secrets that must never exist in a working copy (same as every prior W-branch's own stated baseline) |

**Real bugs this branch's own work caught (fixed, not waved away):**

1. **Mobile Preview build silently talked to Production** — `eas.json`'s
   preview profile hardcoded the exact Production API origin, and this exact
   bug was codified as a *passing* assertion in
   `tests/mobile-release-config-guard.test.ts`. Fixed source and test
   together (section 9).
2. **Web heartbeat liveness never fires on the RealtimeKit path** — both web
   pages' billing-heartbeat gate checked `pcRef.current?.connectionState`,
   which is always null when no `RTCPeerConnection` exists (the RealtimeKit
   path). Found by tracing the heartbeat effect's actual runtime condition
   against the new branch, not by assuming "unrelated code still works
   because I didn't touch it." Fixed on both pages (section 8).
3. **Production DB verifier's trigger check was schema-scoped to `app` only**
   — adding `call_recording_sessions_set_updated_at`/
   `call_recording_segments_set_updated_at` (both on `private_data` tables)
   to the existing query without widening its `nspname='app'` filter would
   have made those two checks permanently unpassable against a real database.
   Caught while writing the new assertions, fixed before it could ship as
   dead verification code (section 12).
4. **`tsc`/Node ESM extension mismatch** — `apps/mobile/src/api.ts`'s new
   relative import needed `.ts` for Node's own loader to resolve it under
   `node --test`, but plain `tsc` rejects `.ts`-suffixed imports without
   `allowImportingTsExtensions`. Fixed by adding that option to
   `apps/mobile/tsconfig.json`, matching `services/api/tsconfig.json`'s
   existing precedent for the identical reason — not by removing the
   extension and breaking the test runner instead.

**Build-tool noise explicitly reverted, not committed**: running `next build`
for `apps/web`/`apps/admin` auto-rewrote `next-env.d.ts` and reformatted
`tsconfig.json` in both apps (adding `.next/dev/types` references,
re-indenting arrays, `"incremental": true`) — pure tool-generated formatting
with zero behavioral effect, reverted via `git checkout --` before committing
so this branch's diff stays scoped to intentional W63 changes only.

## Remaining live steps

Exactly what remains before a recording-required, RealtimeKit-media Web call
can go live in Production — extends W58/W60's own equivalent sections, adds
nothing new beyond what those already named:

1. **Live Cloudflare RealtimeKit credentials** — same dependency W58/W60
   already named; still not provisioned anywhere. `EXTERNAL_BLOCKER`: requires
   Cloudflare account access this session does not have and cannot obtain.
2. **The Cloudflare RealtimeKit Voice preset** — same one W60 already flagged;
   this branch adds no new preset requirement, Web and Mobile share it.
3. **Live API contract verification** — `beginRealtimeKit`/`answerRealtimeKit`
   were built from current public docs and the real npm package's types, with
   no live account to join a real meeting against — same caveat W58's
   recording adapter and W60's mobile integration already carry.
4. **A real two-browser join test** to observe actual `roomJoined`/
   `participantJoined`/reconnect event behavior live in a browser — this
   session verified the documented contract only, the same limitation W60
   stated for its own two-device mobile test.
5. **An isolated Preview API deployment + its URL registered as an
   EAS-hosted environment variable** for the `preview` environment
   (`eas env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL
   --value <preview-url>`) — `EXTERNAL_BLOCKER`: requires an Expo/EAS account
   this session does not have access to. Until this is done, any Preview
   build attempt fails closed at import time with a clear error (by design —
   see section 9) rather than silently reaching Production.
6. **A GitHub Actions `workflow_dispatch` run of `deploy-production-api.yml`**
   to exercise the new `release_profile` input end-to-end against a live
   Vercel/Neon target — `EXTERNAL_BLOCKER`: this is a Production-destructive
   action outside source-review scope; source and its guard tests are the
   verifiable artifact this session can produce.
7. Everything W58/W60's own "remaining" sections already listed that this
   branch does not change: owner retention-policy confirmation,
   `recording_admin` capability grants, the Admin console UI page, Android/iOS
   native builds, speaker/earpiece/Bluetooth routing on a real device.

None of the above stopped source work on this branch. Every source-verifiable
task was completed; only genuinely external, credentialed, or
Production-destructive steps are listed here as deferred.
