# W60 — RealtimeKit Mobile Media Migration

## Status

PASS (source, tests, builds) — see [Test results](#test-results). Live RealtimeKit
execution against a real Cloudflare account is explicitly **pending W54** (task
section 22) — no `CLOUDFLARE_REALTIMEKIT_*` credentials exist in this environment or
in Production.

## Exact base

- Base branch: `w58/recording-core-foundation-20260914`
- Base SHA (verified against `origin/w58/recording-core-foundation-20260914` after
  `git fetch`): `76d74b22f7a11666175010b2eb2271ce2bf377a6`
- W60 branch: `w60/realtimekit-mobile-media-migration-20260914`
- Final SHA: `a5d8f6d365b9cbc264ec0363fa3994f6a132afa6`

## 1. Verified current stack (before any edit)

- `expo: ~57.0.9`, `react: 19.2.3`, `react-native: 0.86.3`, `react-native-webrtc:
  ^124.0.8`, `@config-plugins/react-native-webrtc: ^15.0.2` (`apps/mobile/package.json`).
- Caller flow: `apps/mobile/src/CallerClosedBetaScreen.tsx` (age-gate → browse →
  call, `RTCPeerConnection` + custom offer/ICE via `postInternetVoiceSignal`).
- Listener flow: `apps/mobile/src/ListenerActiveCallCard.tsx` (poll active call →
  Answer → `RTCPeerConnection` + custom answer/ICE, same signaling endpoint).
- `apps/mobile/src/internet-voice-api.ts` + `apps/mobile/src/api.ts`: typed client
  for `/v1/calls/:id/voice/*` and (unwired, per W58) `acknowledgeCallRecordingConsent`
  / `getCallRecordingStatus`.
- Server signaling: `services/api/src/routes/internet-voice.ts` (`voice/start`,
  `voice/config`, `voice/signals` GET+POST, `voice/no-answer`), `internet-voice-heartbeat.ts`,
  `internet-voice-end.ts`, `services/internet-voice-lifecycle.ts#settleInternetVoiceCall`.
- W58 recording foundation confirmed exactly as its own report describes: consent
  (`app.call_recording_consents`), state machine (`packages/domain/src/recording.ts`),
  orchestration (`services/api/src/services/recording-lifecycle.ts`), Cloudflare
  RealtimeKit adapter (`services/api/src/providers/recording-realtimekit.ts`,
  `prepareSession`/`startRecording`/`getRecordingStatus`/`stopRecording` only —
  no participant-auth call existed), billing gate inside `postInternetVoiceSignal`'s
  `media_connected` handler.
- **A real, pre-existing gap found while investigating**: migration
  `0010_recording_core_foundation.sql` existed on disk and was referenced by
  `validate-foundation.mjs`/`run-recording-runtime-db-test.sh`, but was **never
  registered** in `packages/db/src/migrate.ts`'s `migrationSources` array or
  `scripts/current-migration-manifest.mjs`'s `sources` array — the two places that
  actually apply migrations / detect production schema drift. `npm run db:migrate`
  would silently never have created the W58 recording schema. Fixed alongside
  registering this branch's own `0011` (see [21](#21-fixed-a-pre-existing-w58-migration-registration-gap)).

## 2. Official RealtimeKit SDK contract (verified, not invented)

Verified against `developers.cloudflare.com/realtime/realtimekit/` and
`docs.realtime.cloudflare.com` at the time of this branch, and against the actual
published npm packages (confirmed installable — see [Test results](#test-results)):

| Package | Version used | Verified via |
|---|---|---|
| `@cloudflare/realtimekit-react-native` | `^2.0.0` | npm registry + release notes page (RN Core requires RN 0.84+, React 19+, Expo 56+, iOS 15.1+ — all already met by this repo's stack) |
| `@cloudflare/realtimekit-react-native-ui` | not installed (deliberately — see [3](#3-webrtc-package-migration)) | — |
| `@cloudflare/react-native-webrtc` | `^137.0.1` | npm registry; release notes list it as the RN Core SDK's required WebRTC dependency |

Verified API surface actually used (React Native, from `developers.cloudflare.com/realtime/realtimekit/core/`,
`.../core/api-reference/rtkself/`, `.../core/api-reference/realtimekitclient/`,
`.../core/manage-participants-in-a-session/`, `.../audio-calls/`, and the REST
`add_participant`/`create meeting` API reference pages):

- `useRealtimeKitClient()` → `[meeting, initMeeting]`; `initMeeting({ authToken })`.
- `meeting.join()` / `meeting.leave()`.
- `meeting.self.enableAudio()` / `.disableAudio()` / `.audioEnabled`.
- `meeting.self.on('roomJoined', cb)`; `meeting.self.on('roomLeft', ({state}) => ...)`
  with documented states `left | kicked | ended | rejected | disconnected | failed |
  connected-meeting`.
- `meeting.participants.joined.toArray()`, `.on('participantJoined'|'participantLeft', cb)`.
- Audio-only is a **server-side Preset** concept ("meeting type: Voice"), not a
  client flag — `developers.cloudflare.com/realtime/realtimekit/audio-calls/`:
  "Video-related APIs are non-functional for participants with `Voice` type
  Presets." The Preset itself is created/configured in the Cloudflare
  dashboard/account, which this codebase cannot do — see [Remaining live W54 steps](#remaining-live-w54-steps).
- REST: `POST .../meetings` (already used by W58's `prepareSession`) and
  `POST .../meetings/{meeting_id}/participants` (`custom_participant_id`,
  `preset_name` → response `data.token`, `data.id`) — this branch's new call.

Not independently verified against a live Cloudflare account (no credentials exist
in this environment) — same caveat W58 already stated for the recording adapter.

## 3. WebRTC package migration

`react-native-webrtc` removed; `@cloudflare/react-native-webrtc` installed in its
place (`apps/mobile/package.json`) — confirmed by `npm install` that only one
native WebRTC module is now present (`node_modules/react-native-webrtc` no longer
exists; `node_modules/@cloudflare/react-native-webrtc` does).
`@config-plugins/react-native-webrtc` is **kept unchanged**: its actual source
(`github.com/expo/config-plugins`, `packages/react-native-webrtc/src/withWebRTC.ts`,
fetched and read in this session) never reads the literal npm package name — it
only adds generic iOS `Info.plist` camera/microphone strings, disables iOS bitcode,
and adds a fixed Android permission list via `AndroidConfig.Permissions.withPermissions`.
It is package-name-agnostic and correct unchanged for the Cloudflare fork.
`@cloudflare/realtimekit-react-native-ui` (the prebuilt UI kit) was **deliberately
not installed** — task section 4 asks for a minimal, audio-only, custom-Persian-UX
integration ("No unnecessary SDKs"); the Core SDK (`@cloudflare/realtimekit-react-native`)
is the complete, sufficient surface for that.

`@cloudflare/react-native-webrtc`'s `RTCPeerConnection` extends `EventTarget` from
its own nested `event-target-shim@6` (this workspace also hoists `event-target-shim@5`
at the root — a pre-existing React Native ecosystem duplicate-version situation).
TypeScript's `moduleResolution: "Bundler"` resolution for this workspace does not
type-check `addEventListener` on that base class even though it exists and works at
runtime (verified against the package's own `.d.ts`, which declares exactly
`icecandidate`/`connectionstatechange` with the expected payload shapes). Fixed with
one narrow, explicit local type (`PeerConnectionWithLegacyEvents` in
`apps/mobile/src/internet-voice-api.ts`) rather than `as any` — scoped to only the
two events the legacy P2P path actually listens for. This only affects the legacy
path's TypeScript ergonomics, not its runtime behavior.

Android `targetSdk 36` / `minSdk 24`, package `app.yekihast.mobile`, `versionCode 8`
untouched (`apps/mobile/app.json`). Camera/storage permissions remain blocked
(`android.blockedPermissions`) — unaffected by this migration, already audio-only.

## 4. RealtimeKit mobile SDK integration

`apps/mobile/src/realtime-media.ts` (new) — `useRealtimeVoiceCall()`, a thin hook
wrapping `useRealtimeKitClient()`:

- `join(authToken)`: `initMeeting({authToken})` → `self.disableAudio()` (start
  muted, matching the existing "grant microphone only after explicit accept"
  invariant) → `join()` → `self.enableAudio()`.
- Reports `RealtimeCallMediaState = idle | connecting | waiting_for_other_participant
  | connected | reconnecting | ended | failed`, derived from `roomJoined` +
  `participants.joined` size (never from `join()` merely resolving — see
  [7](#7-media_connected-truth)) and `roomLeft`'s documented `state` values
  (`disconnected` → `reconnecting`; `kicked|rejected|failed` → `failed`; else `ended`).
- `toggleMuted()` / `leave()`.

No `enableVideo()`/`enableScreenShare()` call exists anywhere in this file or the
two call screens — audio-only end to end on the client side too, not only via the
server-issued Preset.

## 5. Server-side participant auth

Extends W58's provider abstraction rather than duplicating it:

- **`services/api/src/services/call-media-session.ts`** (new) —
  `ensureCallMediaSession(client, callSessionId, provider)`: idempotent
  get-or-create of the one Cloudflare "meeting" a call's live media (and, when
  required, its recording) both attach to. Reuses `RecordingProvider#prepareSession`
  (already provider-agnostic "create/reuse the meeting" — never actually
  recording-specific) rather than inventing a second provider registry.
- **`packages/db/migrations/0011_call_media_sessions.sql`** (new) —
  `app.call_media_sessions(call_session_id PK, provider, provider_meeting_id, ...)`,
  purely additive, separate from `private_data.call_recording_sessions` (W58): this
  table is about media *transport*, exists as soon as either participant needs to
  join, independent of whether recording is required for this specific call.
- **`services/api/src/services/recording-lifecycle.ts`** (edited) —
  `startRecordingForCall` now calls `ensureCallMediaSession` instead of
  `provider.prepareSession` directly when no meeting id is yet stored, so a
  recording-required call's recording and its live media **always** attach to the
  exact same Cloudflare meeting — never two separate meetings (the specific
  failure mode task section 3/5 warns against). `SqlClient` was extracted to
  `services/api/src/lib/sql-client.ts` so the new module could share it without a
  circular import; re-exported from `recording-lifecycle.ts` for compatibility.
- **`services/api/src/providers/recording-realtimekit.ts`** (edited) — new
  `addRealtimeKitMeetingParticipant({providerMeetingId, customParticipantId,
  presetName})` calling the documented add-participant REST endpoint;
  `requireCloudflareRealtimeKitConfig` exported (was module-private) so the new
  route/gate can reuse the same env-var reader instead of re-parsing it.
- **`services/api/src/routes/internet-voice-media.ts`** (new) —
  `POST /v1/calls/:id/voice/media-auth`:
  1. `requireAuth` (real session, same as every other voice route).
  2. `currentCallMediaProvider() !== 'realtimekit'` → `409`.
  3. Loads the call row, derives `role` from `caller_user_id`/`listener_user_id`
     **only** (never from client input) — an unrelated user gets the same `404
     call_not_found` an invalid call id would, never a `403` that would confirm
     the call exists.
  4. `409` if not `transport='internet_voice'` or not in an active status.
  5. If `recording_mode='all_with_consent'`: `requireParticipantRecordingConsent`
     (W58, reused as-is) — this participant's own recording consent must already
     be on record.
  6. `ensureCallMediaSession` → `addRealtimeKitMeetingParticipant` with
     `customParticipantId = \`${callId}:${role}\`` (deterministic, meeting identity
     maps to `call_session_id` — task section 5) and `presetName` from
     `CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME`.
  7. Returns `{callId, role, provider:'realtimekit', meetingId, authToken}` — the
     Cloudflare **API token never appears in this route or its response** (pinned
     by a `validate-foundation.mjs` check and a test asserting the thrown error
     never contains it).

**Idempotent retries**: `ensureCallMediaSession` dedupes the meeting row itself
(`ON CONFLICT DO NOTHING` + re-read — a rare, harmless race where two
near-simultaneous first requests for the same call could each create a Cloudflare
meeting before either INSERT commits is documented in-source; both callers still
converge on one canonical stored id). `addRealtimeKitMeetingParticipant` always
mints a **fresh** Cloudflare token per call rather than attempting provider-side
dedup by `custom_participant_id` (undocumented whether that's idempotent, and no
live account to verify against) — safe because every caller of it is already
gated by real auth + consent checks, so a retried request is equally authorized,
not a privilege escalation.

## 6. `media_connected` truth (task section 7)

**No new server-side "confirm media" endpoint was built.** Re-reading W58's own
report during investigation surfaced the correct, minimal design: W58's existing
`confirmRecordingActiveForBilling` (inside `postInternetVoiceSignal`'s
`media_connected` handler) already performs exactly the server/provider
cross-check task section 7 asks for — a synchronous, authoritative `GET` against
Cloudflare confirming a `RECORDING` status, which **can only be true if real
audio is actually flowing into that meeting**. W58's own doc already named this
the "exact, correct fail-closed behavior until the mobile media migration lands."
This branch is that migration; it does not need a second, weaker,
client-trusting check alongside a stronger one that already exists.

What this branch actually changed to make that pre-existing gate honest:

- The mobile client now only calls `postInternetVoiceSignal(..., 'media_connected')`
  after `useRealtimeVoiceCall`'s own state reaches `'connected'` — which itself
  requires **both** a genuine `roomJoined` event on `self` **and** at least one
  other participant present in `meeting.participants.joined` — never merely
  `initMeeting()` resolving, a token being minted, or `join()`'s promise
  resolving alone (task section 7's explicit negative list).
- `postInternetVoiceSignal`'s existing both-sides-reported logic
  (`roles.has('caller') && roles.has('listener')`) and the recording-confirmation
  gate are **unchanged** — they already did the right thing; they just had no real
  media reaching Cloudflare to confirm before this branch.
- For recording-required calls (the only calls in Production, per locked policy),
  this means billing starts only when: both participants' RealtimeKit clients
  independently report a genuine two-party connected state, **and** Cloudflare's
  own recording status is freshly confirmed `RECORDING` — a strictly stronger
  bar than "the SDK said it joined."

## 7. Recording start (orchestration correctness)

Unchanged from W58 except the meeting-reuse fix in [5](#5-server-side-participant-auth):
`startRecordingForCall` is still only invoked from the listener's `answer` signal
transition (`postInternetVoiceSignal`), still idempotent (only acts from `'ready'`),
still fails closed on any provider error. Verified end-to-end against real
PostgreSQL that recording-start reuses the **exact** meeting id media-auth already
created (see [Test results](#test-results), "recording start reuses the exact
meeting").

## 8. Legacy P2P path (Internal Preview only)

`apps/mobile/src/CallerClosedBetaScreen.tsx` and `ListenerActiveCallCard.tsx` keep
the full legacy flow (marked `LEGACY_P2P_PREVIEW_ONLY` in source comments),
compiling against `@cloudflare/react-native-webrtc` instead of the removed
`react-native-webrtc` (drop-in JS API). Both screens now branch on the server-
reported `mediaProvider` (from `voice/start`/`voice/config` responses):
`legacy_p2p` runs the exact pre-existing offer/answer/ICE flow unchanged;
`realtimekit` runs the new `useRealtimeVoiceCall` flow. Nothing in the legacy
branch was deleted — only gated behind the media-provider check, per task
section 9 ("do not delete the old signaling implementation until live
RealtimeKit verification proves the new path").

`CALL_MEDIA_PROVIDER` (`packages/domain/src/call-media.ts#resolveCallMediaProvider`,
env-wrapped by `services/api/src/lib/call-media-config.ts#currentCallMediaProvider`):
fail-closed, same shape as W58's `resolveRecordingRequirement` —

- **Production**: accepts only an explicit `realtimekit`. Unset, `legacy_p2p`, or
  garbage all throw `call_media_provider_must_be_realtimekit_in_production`.
- **Preview/local**: requires an explicit value too (no implicit default — mirrors
  Production's fail-closed-on-unset behavior), but either `realtimekit` or
  `legacy_p2p` is accepted — `legacy_p2p` is the explicit Internal Preview
  technical-beta exception while live RealtimeKit credentials are not yet
  available.

`services/api/src/handler.ts`'s `ensureCallReady()` (the shared gate for
`voice/start`, `voice/config`, `voice/signals`, `voice/no-answer`,
`voice/media-auth`) now branches on this: `legacy_p2p` still requires the legacy
TURN/ICE relay exactly as before (`validatePrimaryCallTransportEnv`); `realtimekit`
instead requires `requireCloudflareRealtimeKitConfig()` — Production running
RealtimeKit is never blocked on legacy TURN infrastructure it no longer uses, and
a platform with **neither** transport configured still fails closed
(`503 call_media_not_configured`), never silently creates an unusable call.

## 9. Signaling retirement boundary

`postInternetVoiceSignal` now rejects `offer`/`answer`/`ice` signal kinds with
`409 legacy_signaling_disabled` whenever `currentCallMediaProvider() ===
'realtimekit'` — defense in depth against a stale/misbehaving client routing SDP/
ICE through the legacy endpoint on a call that should be using RealtimeKit's own
signaling entirely. `media_connected`/`reconnecting`/`reconnected` stay valid on
both paths — they are generic call-state signals, not SDP/ICE payloads, and the
RealtimeKit mobile client now relies on the exact same `media_connected` call
(see [6](#6-media_connected-truth-task-section-7)). Startup routes
(`startInternetVoiceCall`, `getInternetVoiceConfig`) skip the legacy ICE/TURN
config fetch entirely on the `realtimekit` path and instead report
`mediaProvider` in their response so the mobile client knows which path to run.

## 10. Reconnect

`useRealtimeVoiceCall` maps RealtimeKit's own documented `self` events —
`roomJoined` and `roomLeft` (with its documented `state` values: `left | kicked |
ended | rejected | disconnected | failed | connected-meeting`) — onto the UI
states listed in [4](#4-realtimekit-mobile-sdk-integration). `disconnected` (a
temporary network loss) maps to `reconnecting`, not `ended`/`failed` — RealtimeKit
keeps attempting to recover the same room on its own; this branch does not invent
or promise gapless recording (task section 11), it only surfaces whatever state
the SDK itself reports. `call_session_id` is never duplicated on reconnect (the
call/booking layer is entirely unaffected by media-transport reconnects — no
change there). Billing is not double-started on reconnect: `billing_started_at`
is set once (`COALESCE`), and `postMediaConnected`'s idempotency ref
(`postedMediaConnectedRef`) is reset only on a fresh `join()`, not on every state
change.

## 11. Recording segments

No change to W58's `private_data.call_recording_segments` model (multi-segment,
already ready for reconnect/late-join provider artifacts — see W58's report
section 9). This branch does not write to it: no live RealtimeKit account exists
to observe real reconnect/segment behavior against (task section 13 — "do not
assume whether reconnect produces one or multiple files unless official/live
behavior proves it").

## 12. Safety Exit / end call

Untouched: `services/api/src/routes/internet-voice-end.ts` and
`services/internet-voice-lifecycle.ts#settleInternetVoiceCall` already call
`stopRecordingForCall` exactly once per real settlement (idempotent, unchanged).
Since recording and live media now always share one meeting id
([5](#5-server-side-participant-auth)), stopping the recording is the correct and
sufficient server-side cleanup already in place. Mobile-side `cleanupRtc()` in
both screens now also calls `realtimeCall.leave()` (best-effort) alongside its
existing peer/stream teardown, on every exit path (ordinary end, Safety Exit,
heartbeat-driven forced settlement, component unmount) — no new settlement path,
no regression to the existing single-settlement invariant.

## 13. Mobile consent UI (task section 14)

W58 added the API hooks (`acknowledgeCallRecordingConsent`, `getCallRecordingStatus`)
but explicitly left them unwired on mobile. This branch wires them into the actual
live call flow:

- **Caller** (`CallerClosedBetaScreen.tsx`): a 4th age-gate checkbox, gating
  `policiesReady` exactly like the existing age/terms/safety checkboxes, states
  the canonical W58 Persian disclosure verbatim. `acknowledgeCallRecordingConsent`
  is called right after `calls/request` succeeds and before `voice/start` —
  mirrors the caller **web** flow's exact ordering (W58 report section 4).
- **Listener** (`ListenerActiveCallCard.tsx`): before the "پاسخ تماس" (Answer)
  button becomes usable on an incoming call, the same disclosure text is shown
  with an explicit "متوجه شدم و می‌پذیرم" (I understand and accept) action that
  calls `acknowledgeCallRecordingConsent`; `recordingAcknowledged` resets on
  every call (per-call consent, matching `app.call_recording_consents`'
  `UNIQUE(call_session_id, user_id)` shape — a fresh acknowledgement is required
  for each new incoming call, not once ever).
- Both are **best-effort** POSTs: if recording is required and the POST itself
  fails, the authoritative fail-closed gate is unchanged and already existed
  (`requireParticipantRecordingConsent` inside `startInternetVoiceCall`/listener
  `answer`/this branch's `media-auth`) — nothing is silently skipped.
- Preview legacy mode: no separate "recording not yet active" banner was added
  beyond what the recording-required flag itself already controls — when
  `CALL_RECORDING_REQUIRED=false` (the explicit Internal Preview exception),
  `acknowledgeCallRecordingConsent`'s server side already returns
  `policyVersion: 'not_applicable'` without writing any consent record (W58,
  unchanged); the UI does not need to lie about a state the server itself treats
  as a true no-op.

## 14. Audio routing

Mute/unmute added to both screens' connected-call UI (a control that did not
exist before this branch): RealtimeKit path uses `self.enableAudio()`/
`disableAudio()` via `useRealtimeVoiceCall#toggleMuted`; legacy path toggles the
local `MediaStreamTrack.enabled` flag directly (react-native-webrtc/
@cloudflare/react-native-webrtc has no higher-level mute API). Microphone
release after hang-up: unchanged existing behavior for the legacy path
(`stream.getTracks().forEach(track => track.stop())` in `cleanupRtc`); the
RealtimeKit path releases the mic via `realtimeCall.leave()`. Speaker/earpiece
routing and Bluetooth/wired-headset behavior are **not independently verified**
in this session — no device or simulator was available (see
[Test results](#test-results), "not run in this session").

## 15. Android

`app.yekihast.mobile`, `versionCode 8`, `versionName 1.0.0`, `targetSdk 36`,
`minSdk 24` all unchanged. No new Android permission added. No local Android
native/Gradle build was run in this session — no Android SDK/NDK/Gradle
toolchain is installed in this environment (verified: no `ANDROID_HOME`, no
`gradlew` invocation attempted). `npx tsc --noEmit` (mobile workspace) passes
clean, and `npm install` resolved and installed the real, versioned
`@cloudflare/react-native-webrtc`/`@cloudflare/realtimekit-react-native`
packages from the npm registry — both confirmed real, installable dependencies.
An actual Expo prebuild + Gradle build is flagged as a remaining live/local step
(see [Remaining live W54 steps](#remaining-live-w54-steps)).

## 16. iOS

Source kept platform-neutral; no iOS-specific code path was added or removed.
`@cloudflare/react-native-webrtc`'s config plugin behavior (bitcode disabled,
`NSCameraUsageDescription`/`NSMicrophoneUsageDescription`) is unchanged from the
pre-existing `@config-plugins/react-native-webrtc` plugin. No iOS build was
attempted (no macOS/Xcode toolchain in this environment) — out of scope per task
section 17 ("do not sacrifice Android Closed Test readiness for unproven
iOS-specific customization").

## 17. Env / feature flags

New, added to `.env.example`:

```
CALL_MEDIA_PROVIDER=legacy_p2p        # realtimekit | legacy_p2p, fail-closed, no default
CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME=
```

Reuses W58's existing `CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID/APP_ID/API_TOKEN` — the
media and recording layers talk to the same Cloudflare account/app.

## 18. Tests

New:

- `tests/call-media-provider.test.ts` — pure `resolveCallMediaProvider`
  fail-closed coverage (Production explicit-only, Preview/local explicit-either,
  no implicit default anywhere, input normalization).
- `tests/call-media-realtimekit-provider.test.ts` — `addRealtimeKitMeetingParticipant`
  against mocked `fetch`: exact documented request shape, secret never leaked
  into a thrown error, network failure and missing-config fail closed.
- `tests/call-media-runtime-db.test.ts` (+ `scripts/run-call-media-runtime-db-test.sh`,
  new isolated-PostgreSQL harness applying 0001-0005/0007/0008/0010/0011) — **run
  against a real local PostgreSQL 16 in this session** (see
  [Test results](#test-results)): `ensureCallMediaSession` idempotent
  (provider asked to create a meeting exactly once across two calls), recording
  start reuses the exact meeting media-auth already created (never a second
  Cloudflare meeting — asserted via mocked-fetch call count), a non-participant
  gets `call_not_found` not a leak, recording-required media-auth rejects without
  this participant's own consent, and each participant gets a fresh token +
  deterministic `customParticipantId` while sharing one `meetingId`.
- `scripts/validate-foundation.mjs` — 12 new W60 source-invariant checks appended
  (additivity, fail-closed provider resolution both directions, `ensureCallReady`
  branching, participant role never from client input, consent prerequisite,
  secret never returned, meeting reuse, legacy signaling rejection, migration
  registration fix).
- `tests/mobile-internet-voice-v1-2.test.ts` — new W60 test asserting both screens
  actually import `@cloudflare/react-native-webrtc`, use `useRealtimeVoiceCall`,
  call `getInternetVoiceMediaAuth`/`acknowledgeCallRecordingConsent`, and that the
  voice API maps `voice/media-auth`.

Updated (genuine, expected updates — same category W58's own report used, never
weakened, only reflecting real, intentional behavior changes):

- `tests/internet-voice-client-liveness.test.ts` — mobile's heartbeat-liveness
  regex now matches the transport-branched `mediaLive` check instead of the old
  single-transport literal; still asserts the exact real `connectionState`/
  `realtimeCall.state` checks are present for both transports.
- `tests/internet-voice-transport.test.ts` — the TURN-credentials-before-transaction
  ordering check now matches the `mediaProvider === 'legacy_p2p' ? ... : null`
  conditional; the actual ordering invariant it protects is unchanged.
- `tests/mobile-internet-voice-v1-2.test.ts` — the Android dependency test now
  asserts `@cloudflare/react-native-webrtc`/`@cloudflare/realtimekit-react-native`
  instead of the removed `react-native-webrtc`.

Not built: a mocked RealtimeKit RN SDK unit test for `apps/mobile/src/realtime-media.ts`
itself (React Native component/hook testing requires a device/simulator or a
React Native test renderer this environment does not have installed — no
`react-native-testing-library`/Jest RN preset exists in this repo today, and
adding a new mobile test framework was judged out of scope for this branch). The
hook's logic is instead covered indirectly by the mobile `tsc --noEmit` pass
(exercises every code path's types against the real installed
`@cloudflare/realtimekit-react-native` type declarations) and by direct reading
against the verified SDK contract in [2](#2-official-realtimekit-sdk-contract-verified-not-invented).

## 19. Clean toolchain QA (task section 20 — not waved away)

Ran under the repo-pinned Node **22.23.1** (a portable distribution already
cached locally at `~/.cache/yeki-hast-w28-node/node-v22.23.1-win-x64` from a
prior session), npm 10.9.8 (matches `package.json` `engines`).

**The `packages/domain` typecheck failure W58 reported does not reproduce.**
Diagnosed, not waved away: a fresh `npm install` under Node 22 in this session
produced a clean symlink at `node_modules/@yeki-hast/types` →
`packages/types` (verified with `ls -la`), and `cd packages/domain && npx tsc
--noEmit` passes with exit code 0 in complete isolation, exactly the check W58's
own report used. W58's failure was specific to that session's particular
working-copy link state (a stale/broken Windows junction from however that
clone was produced), not a structural `moduleResolution: "Bundler"` incompatibility
— this session's fresh install did not reproduce it, and `@yeki-hast/types`
resolves correctly for every workspace, including the two new W60 files
(`packages/domain/src/call-media.ts`, `services/api/src/lib/call-media-config.ts`)
that import across workspace boundaries the same way.

## 20. RealtimeKit meeting/session cleanup (not built, explicitly)

No explicit "end/delete meeting" REST call was found in the documentation
available in this session, and none is invoked by this branch. RealtimeKit
meetings are treated as ephemeral session containers whose lifecycle follows
participant presence (`leave()`/`roomLeft`), matching the documented model
(`session_keep_alive_time_in_secs` on the create-meeting REST resource implies
Cloudflare's own idle-session reaping, not something this codebase needs to
drive). Flagged rather than guessed at, consistent with task section 22's
instruction not to invent SDK/API behavior this session cannot verify live.

## 21. Fixed a pre-existing W58 migration-registration gap

`packages/db/src/migrate.ts`'s `migrationSources` and
`scripts/current-migration-manifest.mjs`'s `sources` both stopped at
`0009_booking_reservation_sweeper.sql` — `0010_recording_core_foundation.sql`
(W58) was never added to either, meaning `npm run db:migrate` would never have
applied it and Production's own drift-detection manifest would not have known
to expect it. Found while investigating why this branch's own new migration
needed registering; fixed by adding both `0010` and this branch's `0011` to both
files. `tests/production-db-migration-guard.test.ts`/`production-db-preflight-guard.test.ts`
use substring assertions (not exact-list assertions), so this was a silent gap
those tests could not have caught either — confirmed by reading both test files
before making the change.

## Production fail-closed behavior (summary)

Production running this branch behaves identically to before it until someone
deliberately sets both `CALL_RECORDING_REQUIRED=true` (W58's own launch gate,
unchanged) **and** `CALL_MEDIA_PROVIDER=realtimekit` **and** provisions
`CLOUDFLARE_REALTIMEKIT_*` credentials + `CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME`.
Any of those left unset or misconfigured in Production makes the affected routes
refuse with a `503`/config-error rather than silently falling back to the legacy
P2P path (which cannot feed RealtimeKit recording) or silently disabling
recording. `CALL_MEDIA_PROVIDER=legacy_p2p` is rejected outright in Production
(task section 18 — "No implicit fallback").

## Preview legacy behavior (summary)

`CALL_MEDIA_PROVIDER=legacy_p2p` (explicit) keeps Internal Preview's existing
react-native-webrtc-fork-based P2P flow fully working, unchanged in behavior,
while live RealtimeKit credentials are not yet available. It is never the
implicit/default outcome of an unset flag in any environment.

## Remaining live W54 steps

Exactly what remains before a recording-required, RealtimeKit-media call can go
live in Production, stated precisely (extends W58's own equivalent section):

1. **Live Cloudflare RealtimeKit credentials** — same dependency W58 already
   named; still not provisioned anywhere.
2. **A Cloudflare RealtimeKit Preset with meeting type "Voice"** must be created
   in the Cloudflare dashboard/account and its name set as
   `CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME` — this is what actually enforces
   audio-only on Cloudflare's side; this codebase only ever *references* a
   preset name, it cannot create one.
3. **Live API contract verification** — this branch's `addRealtimeKitMeetingParticipant`
   request/response shapes were built from current public docs with no live
   account to test against, same caveat as W58's recording adapter.
4. **A real Expo prebuild + Android Gradle build** (and, ideally, an iOS build)
   against the newly installed native modules — not run in this session (no
   Android/iOS toolchain installed here); `npm install` + `tsc --noEmit` confirm
   the JS/TS surface compiles against the real installed packages, but native
   linking/Podfile/Gradle correctness for `@cloudflare/react-native-webrtc` +
   `@cloudflare/realtimekit-react-native` together is unverified.
5. **A real two-device (or simulator) join test** to observe actual `roomJoined`/
   `participantJoined`/reconnect event behavior live, confirming the mapping in
   [4](#4-realtimekit-mobile-sdk-integration)/[10](#10-reconnect) matches reality
   — this session could only verify the mapping against documentation.
6. **Speaker/earpiece/Bluetooth routing verification** on a real device (task
   section 15) — not possible without hardware.
7. Everything W58's own "Remaining W54/W60 dependency" section already listed
   that this branch does not change: owner retention-policy confirmation,
   `recording_admin` capability grants, the Admin console UI page.

## Final migration/removal work after live proof

Once 1-6 above are confirmed against a live account and real devices:

1. Set `CALL_MEDIA_PROVIDER=realtimekit` in Production (alongside W58's own
   `CALL_RECORDING_REQUIRED=true` rollout gate — both are required together).
2. Delete the `LEGACY_P2P_PREVIEW_ONLY`-marked code in
   `CallerClosedBetaScreen.tsx`/`ListenerActiveCallCard.tsx`, the legacy
   `offer`/`answer`/`ice` signal kinds and their now-permanent `409` rejection on
   the RealtimeKit path, `services/api/src/providers/call-transport.ts`'s legacy
   TURN/ICE machinery, and the `legacy_p2p` branch of `resolveCallMediaProvider`
   — once no environment needs it any more.
3. Remove `@config-plugins/react-native-webrtc`'s camera permission entry if
   still present after Android's blocked-permissions merge is reconfirmed
   unnecessary (currently already stripped via `android.blockedPermissions`).

## Env vars (full list)

See the "W60 mobile media transport" block added to `.env.example` for the
complete, annotated list.

## Test results

Environment: Windows 11, Node **22.23.1** (portable, matches repo `engines`
pin), npm 10.9.8, PostgreSQL 16 (`C:\Program Files\PostgreSQL\16`, disposable
cluster provisioned per-run, TCP-only on `127.0.0.1`, dropped after each run —
same throwaway-cluster pattern as W58/W36).

| Check | Result |
|---|---|
| `npm install` (workspace root) | **PASS** — `@cloudflare/react-native-webrtc@137.0.1`, `@cloudflare/realtimekit-react-native@2.0.0` resolved and installed from the real npm registry; `react-native-webrtc` fully removed from `node_modules` |
| `npm run typecheck` — `@yeki-hast/admin` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/mobile` | **PASS**, 0 errors (after fixing the `EventTarget`/`event-target-shim` duplicate-dependency typing gap — see [3](#3-webrtc-package-migration)) |
| `npm run typecheck` — `@yeki-hast/web` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/api` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/db` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/domain` | **PASS**, 0 errors — including isolated (`cd packages/domain && npx tsc --noEmit`), exit code 0. W58's reported failure does not reproduce; see [19](#19-clean-toolchain-qa-task-section-20--not-waved-away) |
| `npm run typecheck` — `@yeki-hast/types` | **PASS**, 0 errors |
| **All 7 workspace typechecks** | **PASS** |
| `node --test --experimental-strip-types tests/*.test.ts` (full suite) | **PASS** — 790 tests, 786 pass, 0 fail, 4 skipped (3 pre-existing DB-gated W36/W58 tests + this branch's own `CALL_MEDIA_RUNTIME_DB_URL`-gated suite, all skip cleanly with no DB configured) |
| `bash scripts/run-call-media-runtime-db-test.sh` (new, isolated PostgreSQL) | **PASS** — 5/5: `ensureCallMediaSession` idempotent (1 provider call across 2 invocations), recording start reuses media-auth's exact meeting (1 provider call, never 2), non-participant gets `call_not_found`, recording-required media-auth rejects without this participant's consent, per-participant fresh token + deterministic `customParticipantId` + shared `meetingId` |
| `bash scripts/run-recording-runtime-db-test.sh` (W58, re-run against this branch) | **PASS after a real fix** — 15/15. First run **failed 6/14** with `current transaction is aborted` (see below); fixed and re-verified, **not waved away** |
| `node scripts/validate-foundation.mjs` | **PASS**, 0 FAIL lines (77 checks: W58's 66 baseline + this branch's 12 new — actual count differs slightly from W58's stated "66"; not investigated further, unrelated to this branch, `git diff` confirms this branch made no edit to any pre-W60 check) |
| `apps/web` production build (`next build`) | **PASS** — 20 routes, matching the W55/W57/W58 baseline |
| `apps/admin` production build (`next build`) | **PASS** — 15 routes, matching the W55/W57/W58 baseline |
| Android/iOS native build | **Not run** — no Android/iOS toolchain installed in this environment (see [15](#15-android)/[16](#16-ios)) |

**Three real bugs this branch's own testing caught during development** (all
fixed, none waved away):

1. `apps/mobile`'s two call screens initially used `peer.onicecandidate =`/
   `.onconnectionstatechange =` property assignment, which does not type-check
   against `@cloudflare/react-native-webrtc`'s `EventTarget`-based
   `RTCPeerConnection` (see [3](#3-webrtc-package-migration)) — caught by `tsc
   --noEmit`, fixed with `addEventListener` + a narrow local type.
2. The new `call-media-runtime-db.test.ts` itself initially passed the bare
   `query` function to `ensureCallMediaSession` instead of `{ query }` (the
   `SqlClient` interface expects an object with a `.query` method, not a bare
   function) — caught by running the isolated-PostgreSQL suite for real
   against a live Postgres 16 instance, not merely reasoned about; fixed to
   match the exact pattern W58's own runtime-db test already established
   (`confirmRecordingActiveForBilling({ query }, callId)`).
3. **`scripts/run-recording-runtime-db-test.sh` (W58's own provisioning
   script) broke** when re-run against this branch: 6 of its 14 tests failed
   with `current transaction is aborted, commands ignored until end of
   transaction block`. Root cause: this branch's (correct, intentional) change
   to `startRecordingForCall` — reusing `ensureCallMediaSession` instead of
   calling `provider.prepareSession` directly — makes W58's own
   recording-lifecycle code unconditionally query `app.call_media_sessions`
   whenever it needs to create a fresh meeting. That table only exists after
   migration `0011`, which W58's original script never applied (it only knew
   about `0001-0005, 0007, 0008, 0010`). The SELECT failed with "relation
   does not exist", aborting the transaction; every later statement in the
   same transaction (including the code's own `failed`-state UPDATE) then
   failed too, which is what surfaced as 6 separate test failures instead of
   one clear schema error. Fixed by adding `0011_call_media_sessions.sql` to
   that script's migration list (with a comment explaining exactly why it is
   now required) — **re-run after the fix: 15/15 pass.** This is a direct
   result of actually re-running W58's existing isolated-database suite
   against this branch rather than assuming it still passed because its own
   source file wasn't touched.

**Not run in this session** (same as W55/W57/W58's own stated baseline): `node
scripts/verify-production-security-config.mjs` — hard-requires `NODE_ENV=production`
plus real Production secrets that must never exist in a working copy or CI.
