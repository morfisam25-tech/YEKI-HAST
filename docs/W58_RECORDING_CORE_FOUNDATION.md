# W58 — Recording Core Foundation

## Status

PASS — see [Test results](#test-results) below for the exact commands and real output.

## Exact base

- Base branch: `w57/safe-internal-beta-preview-20260914`
- Base SHA (verified against `origin/w57/safe-internal-beta-preview-20260914`):
  `2ed5ed5daeaf98b5f1fb416f8686935880112006`
- W58 branch: `w58/recording-core-foundation-20260914`
- Final SHA: `c9334b07cecb5ecc2619fc338f9f88246b38697c`

## Locked product policy (unchanged, restated)

Platform call recording is ON at public launch. Purpose: user safety, complaint
investigation, behavioral dispute evidence, enforcement review. Both participants are
informed before media connects. No advertising use, no public playback, no user
download, no AI training, no routine staff monitoring. Independent participant
recording/rebroadcast remains prohibited. Internal technical Preview may remain
pre-recording (explicitly) while W54/W60 are not complete.

**This branch does not perform the final mobile RealtimeKit signaling migration.**
`apps/mobile`'s active call signaling (`react-native-webrtc`, custom offer/answer, ICE
polling) is untouched except for two Persian copy strings (see
[Legal/training copy](#15-16-17-legal-training-and-store-copy)) and one new,
unused-by-any-screen typed API client method (see
[Mobile hook](#mobile-hook-not-wired)).

## 1. Schema audit — verified against source before changing anything

All three pieces of "dormant support" the task described were verified to already exist,
exactly as described, in `packages/db/migrations/0001_initial.sql`:

| Claimed dormant support | Verified location | Verified shape |
|---|---|---|
| `call_sessions.recording_mode` | `0001_initial.sql:684` | column, `app.recording_mode NOT NULL DEFAULT 'none'` |
| `recording_mode` enum incl. `all_with_consent` | `0001_initial.sql:95` | `CREATE TYPE app.recording_mode AS ENUM ('none', 'all_with_consent', 'policy_exception')` |
| `app.consents` recording consent type | `0001_initial.sql:94,574` | `app.consent_type` enum includes `'recording'`; `app.consents(user_id, consent_type, version, ...)` |
| `private_data.call_recordings` | `0001_initial.sql:766` | exists, `UNIQUE (call_session_id)` |

Every current use of `recording_mode` in the pre-W58 tree hardcoded `'none'`
(`services/api/src/routes/internal-owner-test.ts`) or only read it for admin display
(`services/api/src/routes/admin-calls.ts`). No route, migration, or test referenced
`app.consents(consent_type='recording')` or `private_data.call_recordings` at all.

**Why `private_data.call_recordings` was left untouched instead of reused directly:**
it is `UNIQUE (call_session_id)` — at most one row per call. The task's own reconnect/
segment requirement (section 9) needs zero-or-many provider output artifacts per call
(reconnects, late join, multiple provider files). Repurposing it would have meant
dropping that uniqueness constraint on a table whose exact intended future shape isn't
otherwise specified, which is a larger, riskier change than adding new tables next to
it. It stays reachable, unused, and undisturbed for a future migration to explicitly
retire or backfill from.

`app.consents` (`UNIQUE (user_id, consent_type, version)`) was also left untouched: it
is a *user*-scoped, version-scoped grant (used today for `terms`/`safety_protocol` in
`services/api/src/routes/caller.ts`), not a *call*-scoped one, and cannot represent "did
this specific participant consent to recording for this specific call" without weakening
its own uniqueness semantics. A new table was the additive, non-destructive choice.

## 2. Recording state model

`packages/domain/src/recording.ts` — a pure, DB-free state machine (same style as
`packages/domain/src/billing.ts`), server-authoritative and idempotent:

```
not_requested → consent_pending → ready → starting → recording → stopping
  → uploading → stored → held ⇄ (stored | failed | purged)
starting/recording/stopping/uploading → failed → held
```

`canTransitionRecordingState(from, to)` is the single source of truth for legal edges;
`services/api/src/services/recording-lifecycle.ts` calls it on every write to
`private_data.call_recording_sessions.state` and rejects (409) anything not in the
table. `isRecordingActiveForBilling(state)` returns `true` for **exactly** `'recording'`
— `'starting'` (an accepted-but-unconfirmed provider request) never counts.

## 3. Consent

New table `app.call_recording_consents` (additive, migration `0010`):
`call_session_id, user_id, role, consent_type ('recording'), policy_version, locale,
client_version, accepted_at, revoked_at`, `UNIQUE (call_session_id, user_id)`.

- `POST /v1/calls/:id/recording-consent` (`services/api/src/routes/call-recording.ts`)
  — either participant acknowledges; idempotent upsert; returns whether both parties
  have now consented at the current policy version.
- `GET /v1/calls/:id/recording-status` — per-party consent + recording-required status.
- `packages/domain/src/recording.ts#hasBothPartyRecordingConsent` requires **both** an
  unrevoked row **and** an exact match on the current `policyVersion` — a caller consent
  recorded under an old policy version does not satisfy a call created after the policy
  changed (tested: `tests/recording-domain.test.ts`, `tests/recording-runtime-db.test.ts`
  "stale consent policy version is rejected").
- Refusal prevents the call from progressing: `startInternetVoiceCall` (caller `voice/
  start`) and the listener's `answer` signal in `postInternetVoiceSignal` each call
  `requireParticipantRecordingConsent` and reject (`403 recording_consent_required`)
  before the call can ring or be answered, when `recording_mode='all_with_consent'`.
- Internal Preview technical-beta exception: when recording is not required
  (`CALL_RECORDING_REQUIRED=false`), `recordCallRecordingConsent` returns
  `{policyVersion: 'not_applicable', bothPartiesConsented: true}` immediately — it never
  pretends a real consent record was created, and the gate is a true no-op rather than a
  fabricated pass.

## 4. User copy

Persian pre-call disclosure text (exact meaning preserved, refined for natural UX),
used verbatim or near-verbatim everywhere the platform states its recording posture:

> برای امنیت کاربران و رسیدگی به شکایت‌های احتمالی، این مکالمه توسط پلتفرم ضبط و
> به‌صورت امن نگهداری می‌شود.

Added as a new, required 4th checkbox in `apps/web/app/talk/page.tsx` (alongside the
existing age/terms/safety checkboxes), gating `policiesReady`/call start exactly like
the other three. The actual per-call consent write happens right after `calls/request`
succeeds and before `voice/start`, mirroring the existing age-gate → calls/request
sequence already in that file. No claim of absolute confidentiality, no "nobody can ever
hear this," no implication of routine listening — copy explicitly states limited,
authorized, case-linked access only (see [15](#15-16-17-legal-training-and-store-copy)).

## 5. Provider abstraction

`services/api/src/providers/recording.ts` — `RecordingProvider` interface
(`prepareSession`, `startRecording`, `getRecordingStatus`, `stopRecording`,
`normalizeStatus`) plus a lazy, name-keyed factory (`getRecordingProvider`) so a
deployment that never configures `CALL_RECORDING_PROVIDER` never loads a concrete
adapter. The orchestrator (`recording-lifecycle.ts`) only ever talks to this interface —
never a concrete adapter — so the eventual RealtimeKit **mobile signaling** migration
(out of scope here) plugs into the same orchestrator without touching consent, billing
gate, or admin/evidence code.

### RealtimeKit adapter

`services/api/src/providers/recording-realtimekit.ts`, checked against the current
Cloudflare RealtimeKit REST docs (`developers.cloudflare.com/realtime/realtimekit/` —
`recording-guide/`, `rest-api/resources/meetings`, `rest-api/resources/recordings`) at
the time of this branch:

| Operation | Method + path |
|---|---|
| Create meeting | `POST /accounts/{account_id}/realtime/kit/{app_id}/meetings` |
| Start recording | `POST /accounts/{account_id}/realtime/kit/{app_id}/recordings` (`meeting_id`, `max_seconds`) |
| Recording status | `GET  /accounts/{account_id}/realtime/kit/{app_id}/recordings/{recording_id}` |
| Stop recording | `PUT  /accounts/{account_id}/realtime/kit/{app_id}/recordings/{recording_id}` (`{action:'stop'}`) |

Auth: `Authorization: Bearer <CLOUDFLARE_REALTIMEKIT_API_TOKEN>`, server-side only —
never returned to any client. Documented recording `status` values:
`INVOKED, STARTED, RECORDING, PAUSED, STOPPED, UPLOADING, UPLOADED, ERRORED`.
`normalizeStatus` maps these onto the platform's own state machine
(`RECORDING`/`PAUSED` → `recording`, i.e. the only billing-active value); anything not
in that documented list normalizes to `failed` rather than being guessed at.

**Not independently verified against a live Cloudflare account** — no
`CLOUDFLARE_REALTIMEKIT_*` credentials exist in this environment or in Production yet.
The adapter's unit tests (`tests/recording-provider-realtimekit.test.ts`) mock `fetch`
against the documented request/response shapes; they prove the adapter's own logic
(request construction, status normalization, fail-closed error handling), not that
Cloudflare's live API matches the docs byte-for-byte. **This is exactly the remaining
W54/W60 dependency** — see [Remaining dependency](#remaining-w54w60-dependency).

Webhook signature/payload shape for `recording.statusUpdate` could not be confirmed from
the public docs in this session (the relevant pages 404'd); the adapter therefore does
**not** trust webhooks at all — `confirmRecordingActiveForBilling` always does a fresh,
synchronous `GET` poll for authoritative status rather than relying on a push event.

## 6. Feature / env gating

New env (see `.env.example` for the full annotated block):

```
CALL_RECORDING_REQUIRED=            # true | false, no default — see below
CALL_RECORDING_PROVIDER=cloudflare_realtimekit
CALL_RECORDING_CONSENT_POLICY_VERSION=
CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID=
CLOUDFLARE_REALTIMEKIT_APP_ID=
CLOUDFLARE_REALTIMEKIT_API_TOKEN=
CALL_RECORDING_RETENTION_DAYS=90              # operational default, product policy
CALL_RECORDING_PLAYBACK_TTL_SECONDS=300
CALL_RECORDING_CONFIRMATION_TIMEOUT_SECONDS=45
```

`packages/domain/src/recording.ts#resolveRecordingRequirement` (pure, unit-tested) is
the single fail-closed decision point:

- **Production** (`VERCEL_ENV=production` or explicit `APP_ENV=production`): accepts
  **only** `CALL_RECORDING_REQUIRED=true` with a configured provider + policy version.
  `false`, unset, or `true`-without-full-config all **throw** — production can never
  silently end up with recording off. `services/api/src/routes/caller-call-request.ts`
  calls this before every new call is created; a misconfigured Production **refuses to
  create new calls** (`503 call_recording_not_configured`) rather than creating one that
  can never become billable.
- **Preview/local**: `CALL_RECORDING_REQUIRED=false` is the explicit, intentional
  technical-beta exception (matches W57's Internal Preview design) — recording is a true
  no-op, never a fabricated pass. Anything else (unset, or `true`) goes through the exact
  same fully-configured-or-throw check as Production, so opting a Preview environment
  into recording cannot run half-configured either.

Negative tests: `tests/recording-domain.test.ts` and `tests/recording-config.test.ts`
cover every one of these branches, including "production with the flag unset fails
closed" and "preview with the flag unset (not explicitly false) also fails closed."

## 7. Billing gate

The integration point is `postInternetVoiceSignal`'s `media_connected` handler in
`services/api/src/routes/internet-voice.ts` — the exact place `billing_started_at` was
previously set unconditionally alongside `connected_at`. For a recording-required call,
it now instead calls `confirmRecordingActiveForBilling(client, rawCallId)` — **inside
the same transaction/row-lock** already held for the status transition — which:

1. Short-circuits `true` if the recording session is already confirmed `'recording'`
   (no repeated provider polling).
2. Otherwise makes a **fresh, synchronous** `GET` status call to the provider and only
   returns `active: true` if the *just-observed* status normalizes to `'recording'`.
   An HTTP 200 from the earlier start call is never sufficient by itself.
3. On any provider error, network failure, or unrecognized status: `active: false`,
   session marked `failed`. Never throws into the caller — a recording confirmation
   failure must not become an unhandled 500 on the call's media-connect path.

```sql
billing_started_at = CASE WHEN $2::boolean THEN COALESCE(billing_started_at, now()) ELSE billing_started_at END
```

`status='connected'` is set regardless — **media itself is unaffected**; only
`billing_started_at` is gated. This is a deliberate interpretation: W58 must not touch
the live P2P WebRTC media path (task section 21), so an unconfirmed recording withholds
billing, not the conversation itself. The heartbeat route enforces a bounded timeout
(see [8](#8-recording-failure)) so this window cannot become indefinite free service.

`services/api/src/services/internet-voice-lifecycle.ts#settleInternetVoiceCall` was
changed to bill from `billing_started_at`, not `connected_at`:

```sql
CASE WHEN billing_started_at IS NULL THEN 0 ELSE <seconds since billing_started_at> END
```

For every call where recording is not required, `billing_started_at` is still set in the
same instant as `connected_at` (unchanged behavior, byte-for-byte the same as before this
branch). For a recording-required call whose recording is never confirmed active,
`billing_started_at` stays `NULL` for its whole lifetime and settlement computes exactly
**0** billable seconds/charge/earning — never a constraint-violation crash, never a
partial charge for the unconfirmed window.

Race/idempotency: `startRecordingForCall` only acts when the recording session is
`'ready'`; any other state (already `starting`/`recording`/`failed`/...) is a no-op that
returns the current state without touching the provider (proven by "duplicate start is
idempotent" and "duplicate stop is idempotent" in `tests/recording-runtime-db.test.ts`,
asserting the mocked provider's call count does not increase on the second call).

## 8. Recording failure

- **Before the call connects**: if the listener's `answer` consent check fails, or
  `startRecordingForCall` fails at the moment of ringing, the call simply never becomes
  billable (media may still connect once both sides truly report `media_connected`, but
  billing waits — see [7](#7-billing-gate)). If the call is cancelled/Safety-Exited while
  still pre-`connected` (`internet-voice-end.ts`'s `preconnected_finalized` path), a
  `stopRecordingForCall` call was added there too, since a listener `answer` can already
  have started the provider recording before the call ever reaches `'connected'`.
- **After the call connects, recording never confirms active**: the 5-second Internet
  Voice heartbeat (`internet-voice-heartbeat.ts`) now calls
  `reconcileRecordingForHeartbeat` on every beat for a `connected`, recording-required,
  still-unbilled call. It re-polls the provider; once confirmed, `billing_started_at` is
  set retroactively from that moment. If
  `CALL_RECORDING_CONFIRMATION_TIMEOUT_SECONDS` (default 45s) elapses since
  `connected_at` with no confirmation, the heartbeat **forcibly settles the call**
  (`endedReason='recording_confirmation_timeout'`) — zero charge (billing never started),
  call ends deterministically rather than continuing indefinitely as a supposedly
  recorded-but-actually-unrecorded public call.
- Internal Preview (recording explicitly disabled): none of the above ever engages —
  `reconcileRecordingForHeartbeat` returns `'not_applicable'` immediately.

## 9. Reconnect / segments

`private_data.call_recording_sessions` is the one authoritative provider-facing session
per call (`UNIQUE (call_session_id)`); `private_data.call_recording_segments` is a
**many**-per-session evidence table (`recording_session_id` FK, no cardinality
constraint) for provider output artifacts — reconnects, late join, extensions, or
multiple provider files, all tied back to exactly one `call_session_id` transitively
through the session row. No undocumented RealtimeKit reconnect file semantics were
invented; the segment table is deliberately generic (`provider_output_id`,
`participant_identity`, timestamps, `state`) so either a single composite file or many
per-participant files fit without a schema change. Nothing in this branch writes rows
into `call_recording_segments` yet (there is no live provider output to describe) — it
exists, is migrated, and is ready for the follow-up media migration to populate.

## 10. Evidence metadata

`private_data.call_recording_sessions` + `call_recording_segments` together carry:
recording ID, `call_session_id`, provider, provider recording/meeting ID, participant
identity (per segment), storage reference (ciphertext, never plaintext) + encryption key
version, `started_at`/`ended_at`, duration, bytes, `checksum_sha256`, `state`,
`failure_code`, `consent_policy_version`, `retention_until`, `legal_hold` (+ reason/case/
who/when set and released), `purged_at`. Not called courtroom-grade evidence anywhere in
code, tests, or copy.

## 11. Storage / archive interface

No R2 bucket, no Cloudflare storage resource, and no signed-URL generation were
provisioned or implemented. `storage_reference_ciphertext` + `encryption_key_version`
columns exist to receive an encrypted object reference once an archival pipeline exists,
but nothing writes them yet. `requestRecordingPlaybackGrant`
(`services/api/src/routes/admin-recording.ts`) deliberately returns `playbackUrl: null`
with an explicit note — the grant/audit boundary is built and tested; the actual
short-lived signed URL a future storage integration would generate is out of scope here,
exactly as instructed ("do not provision R2 or Cloudflare resources"). No signed URL is
ever logged (none is ever generated by this branch).

## 12. Retention

`CALL_RECORDING_RETENTION_DAYS` defaults to `90`, explicitly documented in
`.env.example` and on the Privacy page as an **operational default, not a statutory
claim** ("این یک بازه عملیاتی قابل تنظیم است، نه یک الزام قانونی مشخص"). No prior
owner-approved retention value existed to preserve, so 90 days was chosen as a
commonly-used, conservative-but-not-indefinite operational baseline pending owner
confirmation — flagged in this doc and in the source comment on
`recordingRetentionDays()` as PRODUCT POLICY.

`legal_hold=true` unconditionally excludes a session from
`listPurgeEligibleRecordingSessions` regardless of `purge_eligible_at` (tested:
"retention hold overrides purge eligibility and is reversible"). The actual destructive
purge job is **not implemented** — `listPurgeEligibleRecordingSessions` is read-only, by
design, matching "actual destructive purge job may remain disabled until storage
integration exists."

## 13. Admin safety access

`app.admin_users.admin_role` is a single free-text field with no fine-grained permission
today (`requireAdmin` only checks *any* active admin row exists). New, minimal,
additive: `app.admin_capabilities(user_id, capability, granted_by, granted_at)` +
`requireAdminCapability(req, capability)` in `services/api/src/lib/admin.ts`. Every
recording-admin route (`admin-recording.ts`) requires the `recording_admin` capability —
**not granted to any admin by default**; granting it is a manual, deliberate DB write
(no self-service UI in this branch).

- `GET /v1/admin/safety-cases/:kind/:id/recording` — metadata only (state, timestamps,
  hold, failure code); never a storage reference.
- `POST /v1/admin/recordings/:id/playback-grant` — requires `{caseKind, caseId,
  reasonCode}`; verifies the recording session's `call_session_id` actually matches the
  stated case's `call_session_id` (rejects `recording_case_mismatch` otherwise — tested);
  writes a `recording_playback_grants` row (short-lived `expires_at`, default 300s) *and*
  an `app.audit_logs` row in the same request. No default download button anywhere; no
  public URL is ever produced.
- `POST /v1/admin/recordings/:id/hold` / `.../hold/release` — same capability + case
  linkage, same audit trail, calls the idempotent/reversible `setRecordingLegalHold` /
  `releaseRecordingLegalHold`.

## 14. Evidence hold

Covered in [10](#10-evidence-metadata)/[12](#12-retention)/[13](#13-admin-safety-access):
explicit (`legal_hold` boolean + required reason code + required case link), auditable
(`admin_recording_hold_set`/`_released` rows in `app.audit_logs`), reversible
(`releaseRecordingLegalHold`), idempotent (`WHERE legal_hold=true` on release — releasing
an already-released hold is a no-op), and overrides scheduled purge unconditionally.

## 15/16/17. Legal, training, and store copy

**Patched active runtime copy** that previously asserted recording is off (all pure text
changes; no signaling/logic files touched beyond the routes described above):

`apps/web/app/{talk,privacy,trust,terms,safety,safety/children,faq,booking/call}/page.tsx`,
`apps/mobile/App.tsx` (one string), `apps/mobile/src/CallerClosedBetaScreen.tsx` (one
string). Each now states: the platform records for safety/complaint purposes, both
participants are informed before connecting, no ad/public-playback/download/AI-training
use, access is limited to authorized safety-admin case review, independent participant
recording/rebroadcast stays prohibited, and (Privacy page) the operational retention
default + legal-hold override. No claim of absolute confidentiality, no "nobody will
ever hear this," no implication of routine listening.

`apps/web/app/api/caller/[...path]/route.ts` — the caller-proxy allowlist was extended
for the two new call-scoped recording endpoints (it is a strict allowlist; without this
the new routes would 404 through the web app even though the API itself serves them).

**Listener Academy** (`apps/mobile/src/ListenerTrainingScreen.tsx`) — narrow patch, not a
rewrite: one paragraph added to the existing "۴. مرزهای سالم" (healthy boundaries)
module covering exactly the task's list (platform records, both parties informed,
Listener has no access, Listener cannot promise deletion, Listener must not
independently record/rebroadcast, Listener must not promise "nobody will ever hear
this"), plus one new assessment question (`q_recording`) with a correct
accurate-disclosure choice and two wrong choices (false "no recording exists" promise;
offering to self-record). The assessment is admin-reviewed, not auto-graded server-side
(`app.listener_assessment_attempts.result` starts `'pending'`), so no server-side answer
key needed updating.

**Mobile hook (not wired)**: `apps/mobile/src/api.ts` gained
`acknowledgeCallRecordingConsent` / `getCallRecordingStatus`, typed clients for the two
new endpoints, explicitly commented as not called from any screen yet — the actual
pre-call disclosure UI and where in the live call flow to call this belongs to the
follow-up RealtimeKit mobile migration.

**Google Play source notes** (not filed): `docs/STORE_SUBMISSION_ANSWERS.md` and
`docs/GOOGLE_PLAY_FINAL_PACKET.md` updated from "Platform recording: Off" to the accurate
W58 posture (collected, not shared/sold/advertised/trained-on, app-functionality
purpose, limited authorized access). Nothing was submitted to Play Console.

## 18. Internal Preview invariant

Recording gating reuses the exact same `VERCEL_ENV`/`APP_ENV` resolution pattern W57's
`resolveAppEnv()` established (`services/api/src/lib/recording-config.ts`
`resolveRecordingEnvironment()`), not a new identity check — so it inherits the same
proven fail-closed properties instead of re-deriving them. No W57 file
(`_env.ts`, `internal-owner-test.ts`, the Preview backend-routing guard) was modified.
`isInternalOwnerTestMode()` is untouched; the owner-test call flow still hardcodes
`recording_mode='none'` (`internal-owner-test.ts` route, unchanged).

## 19. Home

`apps/web/app/page.tsx` and `apps/web/app/home.module.css` were not opened for editing.

## 20. Tests

New files:

- `tests/recording-domain.test.ts` — pure, no DB: state machine, both-party consent
  validity (incl. stale policy version, revoked consent), fail-closed policy resolution
  for every environment × flag combination, purge eligibility.
- `tests/recording-config.test.ts` — env-var wiring for the above through
  `process.env`/`VERCEL_ENV`/`APP_ENV`, including "production cannot silently downgrade
  required recording to OFF through missing config."
- `tests/recording-provider-realtimekit.test.ts` — RealtimeKit adapter against a mocked
  `fetch`: request shape, status normalization (documented vocabulary + fail-closed
  default for anything undocumented), non-success/unreachable-provider error codes, no
  secret leakage into responses/errors.
- `tests/recording-runtime-db.test.ts` — real isolated PostgreSQL (see
  `scripts/run-recording-runtime-db-test.sh`): both-party consent required, stale
  consent rejected, missing provider credentials fails closed, a 200-with-success:false
  provider response never counts as billing-active, `INVOKED` alone never counts as
  billing-active (only a fresh `RECORDING` poll does), duplicate start/stop idempotent
  (provider call-count asserted), provider failure recorded with a failure code, Preview
  explicit-disable is a true no-op, retention hold overrides purge eligibility and is
  reversible, unauthorized admin (no capability) is rejected, authorized admin playback
  grant + hold/release are audited, and a playback grant for a case/recording mismatch is
  rejected.
- `scripts/validate-foundation.mjs` — 12 new source-invariant checks appended (schema
  additivity, call-scoped consent, multi-segment evidence table, hold requires reason+
  case, capability is a separate grant, playback grants have an expiry, only `'recording'`
  counts as billing-active, production fail-closed wording, the billing-gate call site
  itself, and the `billing_started_at`-anchored settlement change).

**Scope decision, stated plainly**: this suite does **not** attempt a full HTTP-level
runtime-DB test of `postInternetVoiceSignal`/`startInternetVoiceCall`/the heartbeat route
against local PostgreSQL. Those routes read `voice_offer_started_at`,
`voice_listener_answered_at`, `caller_voice_heartbeat_at`, `listener_voice_heartbeat_at`
— all added in migration `0006_internet_voice_server_sweeper.sql`, which requires the
Neon-specific `pg_cron` extension and is documented (W57, "Test results") as not
available on plain local PostgreSQL. This is the exact same pre-existing local-
infrastructure gap W57 already hit, not one introduced here. The billing-gate code
itself is covered two other ways instead: (a) the runtime-DB suite exercises the
*service-layer* functions the route calls (`confirmRecordingActiveForBilling`,
`startRecordingForCall`, `stopRecordingForCall`) directly against real Postgres, and (b)
`validate-foundation.mjs` pins the exact call site
(`confirmRecordingActiveForBilling(client, rawCallId)`) and the settlement anchor change
in source. A real Neon/Production environment (where `pg_cron` and the full migration
chain are both available) would not have this gap.

## Remaining W54/W60 dependency

Exactly what remains before recording-required calls can go live in Production, stated
precisely:

1. **Live Cloudflare RealtimeKit credentials** (`CLOUDFLARE_REALTIMEKIT_ACCOUNT_ID/
   APP_ID/API_TOKEN`) do not exist anywhere yet. Until they do, `currentRecordingPolicy()`
   throws in Production (by design — see [6](#6-feature--env-gating)), so Production
   cannot create *any* new call today with this branch alone; it needs either those
   credentials configured or `CALL_RECORDING_REQUIRED` left unset (which also throws,
   fail-closed) — in other words, this branch does not change Production behavior until
   someone deliberately turns it on.
2. **The mobile signaling migration itself** (replacing `react-native-webrtc`/custom
   offer-answer/ICE polling with RealtimeKit) is what actually puts call media through a
   path RealtimeKit can record. Until then, `startRecordingForCall`'s `prepareSession`/
   `startRecording` calls would create a Cloudflare "meeting"/recording session that has
   no media flowing into it (the real call audio stays on the current P2P WebRTC path) —
   meaning even with live credentials, a recording-required call today would poll forever
   and hit the heartbeat's `RECORDING_CONFIRMATION_TIMEOUT_SECONDS` fail-closed
   termination, by design, rather than silently billing for a call nothing actually
   recorded. **This is the exact, correct fail-closed behavior until the mobile media
   migration lands** — not a bug in this branch.
3. **Live API contract verification** — the RealtimeKit adapter was built from the
   current public docs (section 5) with no live account to test against; the webhook
   payload/signing shape could not be confirmed at all (pages 404'd), which is why the
   adapter never trusts a webhook and always does a synchronous status poll instead.
4. **Owner retention-policy confirmation** — `CALL_RECORDING_RETENTION_DAYS=90` is this
   branch's chosen operational default, explicitly marked as such everywhere it appears;
   an owner-approved value should replace it before public launch if different.
5. **Admin capability grants** — `recording_admin` must be manually granted to specific
   safety-admin accounts (`INSERT INTO app.admin_capabilities`); no admin has it by
   default after this migration, and there is no self-service UI to grant it yet.
6. **Admin console UI** — the playback-grant/hold/release/metadata endpoints exist and
   are tested at the API layer; a dedicated `apps/admin` page wiring them into the
   existing Safety console (`apps/admin/app/safety/page.tsx`) was **not** built in this
   branch, to keep scope and test coverage honest within the time available. The API is
   the complete, correct surface for that follow-up to call.

None of the above blocks this branch's actual deliverable: a fully additive, tested,
fail-closed foundation that the RealtimeKit media migration and the Admin console UI can
both build on without re-deriving the consent, billing-gate, evidence, hold, or audit
model.

## Env vars (full list)

See the "Call recording (W58 foundation)" block added to `.env.example` for the complete,
annotated list with defaults and fail-closed notes.

## Rollout gate

1. Merge this branch (or its final integrated form) with `CALL_RECORDING_REQUIRED`
   **unset** everywhere — Production continues to refuse new calls exactly as it does
   today until this is deliberately turned on (fail-closed default, not a new risk).
2. Complete the W54 live RealtimeKit PoC and the mobile signaling migration.
3. Provision real `CLOUDFLARE_REALTIMEKIT_*` credentials (Production + any Preview that
   wants them) and confirm the adapter's request/response assumptions against the live
   API.
4. Confirm/replace the 90-day retention default with an owner-approved value if
   different.
5. Grant `recording_admin` to the specific safety-admin accounts who need playback/hold
   access; build the Admin console UI page (API is ready).
6. Set `CALL_RECORDING_REQUIRED=true` in Production only after 1-5 are all true — at
   that point new calls will fail closed (refuse to create) until it is set, so this
   step is itself the actual launch trigger, not merely a config toggle to flip early.

## Test results

Environment: Windows 11, Node 24.19.0 (repo pins `22.x`; installed with
`--engine-strict=false`, same as W57), npm 11.17.0, a disposable local PostgreSQL 16
(EnterpriseDB Windows binaries, no service — initialized under a throwaway temp data
directory, TCP-only on `127.0.0.1` with unix sockets disabled, dropped after each run).

| Check | Result |
|---|---|
| `node --test --experimental-strip-types tests/*.test.ts` (full suite) | **PASS** — 771 tests, 768 pass, 0 fail, 3 skipped (2 pre-existing `SAFETY_ADMIN_RUNTIME_DB_URL`-gated W36 tests + this branch's own `RECORDING_RUNTIME_DB_URL`-gated suite, both skip cleanly with no DB configured) |
| `bash scripts/run-recording-runtime-db-test.sh` (new, isolated PostgreSQL) | **PASS** — 15/15: both-party consent required, stale consent rejected, missing credentials fail closed, provider `success:false` never billing-active, `INVOKED` alone never billing-active (only a fresh `RECORDING` poll counts), duplicate start/stop idempotent (provider call-count asserted), provider failure recorded with a failure code, Preview explicit-disable is a true no-op, hold overrides purge eligibility and is reversible, unauthorized-admin rejection, authorized playback grant + hold/release audited, case/recording mismatch rejected |
| `node scripts/validate-foundation.mjs` | **PASS**, 0 FAIL lines (66 checks total: the pre-existing baseline plus the 12 new W58 checks) |
| `npm run typecheck` — `@yeki-hast/admin` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/mobile` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/web` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/api` | **PASS**, 0 errors (after fixing a real error this branch introduced — see note below) |
| `npm run typecheck` — `@yeki-hast/db` | **PASS**, 0 errors |
| `npm run typecheck` — `@yeki-hast/domain` | **FAIL, pre-existing and unrelated to this branch** — `src/age-visibility.ts(1,36): error TS2307: Cannot find module '@yeki-hast/types'`. Verified: `age-visibility.ts` is byte-identical to the base commit (`git show 2ed5ed5d...:packages/db/migrations/... age-visibility.ts` diffed clean), the file imports nothing this branch touches, and the `@yeki-hast/types` workspace symlink (`node_modules/@yeki-hast/types`, a Windows junction to `packages/types`) exists and resolves correctly. This reproduces in complete isolation (`cd packages/domain && npx tsc --noEmit`) with none of this branch's files even present in that invocation's dependency graph. Root cause not resolved in this session (looks like a `moduleResolution: "Bundler"` + Windows-junction + TypeScript 5.9 interaction, not a workspace-linking failure) — flagged here rather than silently ignored. `packages/domain/src/recording.ts` itself has no import that could trigger this. |
| `npm run typecheck` — `@yeki-hast/types` | **PASS**, 0 errors |
| `apps/web` production build (`next build`) | **PASS** — 20 routes, matching the W55/W57 baseline (`/`, `/account/delete`, 5 `/api/*` handlers, `/booking`, `/booking/call`, `/faq`, `/listener`, `/listener/work`, `/manifest.webmanifest`, `/privacy`, `/safety`, `/safety/children`, `/talk`, `/terms`, `/trust`) |
| `apps/admin` production build (`next build`) | **PASS** — 15 routes, matching the W55/W57 baseline |

**A real bug this branch introduced was caught and fixed by the typecheck run itself**:
`recording-lifecycle.ts`'s original `SqlClient = PoolClient | { query: typeof query }` union
type was not callable (TS2349 — the overloaded `PoolClient.query` and the `query` helper's
signature could not be reconciled in a union). Replaced with a small structural
`SqlClient` interface (single generic `query` signature) that both a transaction's
`PoolClient` and the top-level `query` function satisfy structurally. This is the
mechanism `confirmRecordingActiveForBilling`/`requireParticipantRecordingConsent` use to
accept either a transaction client or the plain `query` function interchangeably.

**A Windows-specific environment issue was found and fixed, matching W57's own
documented experience exactly**: this machine's global `git config core.autocrlf=true`
converts the repo's LF line endings to CRLF on checkout. Because the initial `git clone`
for this branch happened before `core.autocrlf` was set to `false` in this local clone's
own `.git/config` (not global, not committed), every file in the working tree had
Windows CRLF line endings while the committed blobs are LF. This was caught by two
pre-existing tests failing with whole-file diffs (`w33-public-legal-trust.test.ts`'s
"frozen Home files retain the exact approved blobs" and a raw-content comparison) before
any content was even inspected. Fixed by normalizing every tracked file back to LF
line-by-line (content-preserving; verified against `git show HEAD:<path>` for every file
this branch actually edits — all 25 were already LF in the base commit, so no data was
lost) and setting `core.autocrlf=false` locally. After that fix, the only test failures
remaining were genuine, expected ones (see below) — not further line-ending noise.

**A second, unrelated Windows/MSYS issue was found and fixed in the new
`scripts/run-recording-runtime-db-test.sh`** (not present in the pre-existing
`run-safety-admin-runtime-db-test.sh`, which was not modified): `pg_ctl -o
"...unix_socket_directories=$WORK_DIR"` failed to start the server
(`could not create lock file ".../.s.PGSQL.<port>.lock": No such file or directory`)
because Git Bash/MSYS does not translate the POSIX path embedded inside a combined `-o`
option string the way it translates a standalone path argument. Fixed by disabling Unix
domain sockets entirely (`unix_socket_directories=`) and relying on TCP-only
`127.0.0.1` connections throughout (init/start/createdb/psql already used `-h
127.0.0.1`). Migration `0009_booking_reservation_sweeper.sql` was also found to require
the same Neon-only `pg_cron` extension as `0006` (confirmed it adds no table/column/type
— pure cron-job registration) and is skipped by the same script for the same reason.

**Genuine, expected test updates** (not regressions): patching the active recording-off
copy (section 15) made several pre-existing tests fail because they pinned the literal
old Persian phrases (`tests/w33-public-legal-trust.test.ts`,
`tests/store-submission-readiness.test.ts`) or the exact old SQL substring at the
billing-gate call site (`tests/internet-voice-transport.test.ts`). All three were updated
to assert the new, accurate copy/source instead of the old one (never simply deleted or
weakened) — including one real miss this caught: `apps/web/app/safety/page.tsx` had a
second, separate sentence ("گزارش‌ها... نه از صدای تماس" — reports use report text, not
call audio) that the initial grep-based copy pass missed because it doesn't contain the
literal string "ضبط"/"recording"; the stale-test failure surfaced it and it was patched
too.

**Not run in this session** (same as W55/W57's own stated baseline): `node
scripts/verify-production-security-config.mjs` — hard-requires `NODE_ENV=production`
plus real Production secrets that must never exist in a working copy or CI.
