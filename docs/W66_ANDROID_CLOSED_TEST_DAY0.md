# W66 Android Closed Test Day-0 acceleration report

Audit date: 2026-09-15 UTC
Verdict: **BLOCKED**

This report covers Android only. Web/Claude W65 was not checked out, modified,
rebased, or otherwise touched.

## Scope and exact source

- Isolated worktree: `C:\Users\90539\code\YEKI-HAST-W66`
- Branch: `w66/android-closed-test-day0-20260915`
- Android/application source SHA audited: `c64308edb71533fdcea915eb884f38303021c096`
- W63 commit: `docs(w63): record final commit SHA`
- Production release lane: unchanged; no Production deployment or Play mutation was performed.
- W65 isolation: preserved. The existing `rc-worktree`, `w37-android-rc`, and `w55-final-rc` worktrees were not changed.

## Release configuration truth

Verified from `apps/mobile/app.json`, the resolved Expo config, the generated
prebuild, and the lockfile:

| Field | Verified value |
|---|---|
| Product/app label | `یکی هست` |
| Android package/applicationId | `app.yekihast.mobile` |
| Version name | `1.0.0` |
| Version code | `8` |
| Expo SDK | 57 (`expo` lock resolution `57.0.18`) |
| React Native | `0.86.3` |
| compileSdk / targetSdk | `36` / `36` |
| minSdk | `24` |
| RealtimeKit RN | `@cloudflare/realtimekit-react-native` `2.0.0` |
| WebRTC native package | `@cloudflare/react-native-webrtc` `137.0.1` |
| EAS project ID | `58b9f62d-db82-421a-ad59-edccac70c316` |

EAS profiles are explicitly separated:

- `preview`: internal distribution, Node `22.23.1`, `EXPO_PUBLIC_APP_ENV=preview_internal_beta`; it requires a non-Production `EXPO_PUBLIC_API_BASE_URL` and fails closed if missing.
- `production`: Node `22.23.1`, `EXPO_PUBLIC_APP_ENV=production`, API origin `https://yeki-hast-unique-6ff0.vercel.app`.
- `submit.production` exists but contains no upload configuration.
- `cli.requireCommit=true` and `appVersionSource=local` are set.

### Permissions and disclosure

Application source requests only `android.permission.RECORD_AUDIO` and blocks
camera, dump, external storage read/write, and system-alert-window permissions.
The generated release manifest contains the expected dependency/runtime
permissions `INTERNET`, `ACCESS_NETWORK_STATE`, `MODIFY_AUDIO_SETTINGS`,
`BLUETOOTH`, `VIBRATE`, and `WAKE_LOCK`, plus `RECORD_AUDIO`. The blocked
permissions appear only as manifest-removal directives; the debug-only manifest
adds system-alert-window for development and is not the release surface.

The microphone disclosure is configured in `app.json` in Persian. Caller UI
requires age, terms, safety, and recording acknowledgement before the call
flow. Listener UI shows a separate recording notice and acknowledgement before
the Answer action. The recording consent API is called before live-media join;
the server remains authoritative and rejects media access without consent.

The current source-facing product statement is that calls are live Internet
Voice, for users 18+, recorded and securely retained by the platform for safety
review, and not therapy, medical care, dating, or emergency service. This must
match the exact deployed backend and privacy policy before Console submission.

### Media/provider assumptions

The mobile RealtimeKit path obtains a short-lived participant token from the
first-party API and joins the server-created meeting. It does not send legacy
SDP/ICE signaling on the RealtimeKit path, does not enable video or screen
share, and does not request camera access.

Production server source fails closed unless all of the following are true:

- `CALL_MEDIA_PROVIDER=realtimekit`;
- Cloudflare RealtimeKit account/app/API configuration exists;
- the Cloudflare RealtimeKit Voice preset exists and is named by
  `CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME`;
- recording policy is explicitly configured for Production, including
  `CALL_RECORDING_REQUIRED=true`, provider, and consent-policy version;
- the live RealtimeKit participant and recording API contract works.

The legacy P2P path is retained only for Preview/local technical-beta use. No
Cloudflare API secret or permanent signing secret was found in `apps/mobile`;
the client only contains the public API origin and a short-lived auth-token
response type.

## EAS, signing, and AAB status

- Installed `eas` executable: **not present**.
- `npx --yes eas-cli@latest --version`: `eas-cli/24.4.2 win32-x64 node-v24.19.0`.
- `npx --yes eas-cli@latest whoami`: **Not logged in**.
- `project:info`: blocked because an Expo user account is required.
- Android credential status: **not observable without authenticated EAS access**.
- Source tree upload keystore: **not present**.
- Existing Play/EAS signing continuity: **ambiguous**; no new signing identity was created.
- Local Java/JDK: absent; `gradlew.bat --version` failed because `JAVA_HOME` and `java` are unavailable.
- Android SDK/`adb`: absent; `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset.

An isolated Expo prebuild confirmed that the generated release variant points at
the generated `debug.keystore`. That is an inspection-only debug signing path,
not a Play upload identity. It was not used to create or upload an AAB.

| Artifact field | W66 result |
|---|---|
| AAB | **NOT CREATED** |
| AAB path | None |
| SHA-256 | N/A |
| Signing certificate fingerprint | N/A |
| Release/not-debug confirmation | Not applicable; no AAB |
| Manifest/binary scan | Source/prebuild only; no packaged binary |
| Production secret scan | Source-only pass; no AAB to inspect |

No build requiring payment or credits was attempted. No Google Play upload was
attempted.

## Verification performed

- `npm ci` with the repository’s strict engine requirement: blocked by the local Node/npm mismatch (`24.19.0`/`11.17.0` vs required `22.x`/`10.9.8`).
- `npm ci --engine-strict=false`: completed in the isolated worktree; npm reported 43 dependency audit findings (tooling/runtime classification still requires owner review).
- Mobile typecheck: **PASS**.
- Targeted mobile/release/artwork/API tests: **29/29 PASS**.
- `npx expo config --json`: **PASS**; package, version, permissions, project linkage, and profiles resolved.
- `npx expo prebuild --platform android --no-install`: **PASS** in the isolated worktree.
- `git diff --check`: **PASS**.
- Physical-device or emulator smoke: **NOT RUN**; no device/emulator or `adb` exists.

## Current production/API and legal endpoint check

The source-designated Production API origin was checked with public GETs on
2026-09-15:

| URL | HTTP result |
|---|---:|
| `https://yeki-hast-unique-6ff0.vercel.app/health` | 404 |
| `https://yeki-hast-unique-6ff0.vercel.app/v1/bootstrap` | 404 |
| `https://yekihast.app/privacy` | 200 |
| `https://yekihast.app/terms` | 200 |
| `https://yekihast.app/account/delete` | 200 |
| `https://yekihast.app/safety` | 404 |
| `https://yekihast.app/safety/children` | 404 |
| `https://yekihast.app/trust` | 404 |

The app intentionally refuses to open sign-in or registration when bootstrap
is unavailable. The canonical API/bootstrap and missing public safety routes
are therefore release blockers; the old retired API origin must not be used as
a workaround.

## Store asset inventory

Committed mobile asset inventory:

- Mobile `assets` directory: **not committed**.
- Feature graphic: **missing**.
- Phone screenshots: **missing**.
- Play listing icon is generated by `apps/mobile/scripts/generate-artwork.mjs`,
  not stored as a committed binary. The generator produces:
  - `play-store-icon.png`: 512x512, 137,827 bytes;
  - `app-icon.png`: 1024x1024;
  - adaptive foreground and monochrome assets: 1024x1024 each.
- Existing Web `.webp` assets are not Android phone screenshots and must not be
  repurposed as Play evidence.

Exact shot-list/spec for Owner capture from the actual installed app:

1. Home / human Listener value proposition and 18+ boundary.
2. Listener profile/training entry flow.
3. Caller age, terms, safety, and recording-consent gate.
4. Active Internet Voice call state showing the real call controls, mute, and
   Safety Exit without personal data.

Use the actual release-signed app; do not fabricate screens or add device
frames. Current Play preview-asset requirements are a 512x512 32-bit PNG icon
with alpha and max 1 MB, a 1024x500 JPEG or 24-bit PNG feature graphic without
alpha, and at least two screenshots. For stronger app-listing coverage, prepare
four portrait screenshots at 1080x1920 or larger while respecting Play’s
current maximum-dimension rules. See [Google’s preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).

## Play Console Day-0 checklist

The repository’s last Console snapshot says: Draft app exists for this package,
Alpha/closed testing is inactive, zero testers are configured, no AAB is
uploaded, and the 14-day clock has not started. This is repository evidence,
not a live Console read. Every item below is `OWNER/PLAY-CONSOLE` unless noted.

1. Verify the Play app record package is exactly `app.yekihast.mobile`.
2. Make the source-designated API origin serve `/health` and a compatible
   `/v1/bootstrap`; verify `legal.ready=true` and all legal/support URLs before
   inviting testers.
3. Create/verify the Closed testing track and upload only a fresh,
   release/upload-signed versionCode 8 AAB. Never upload the retired vc7 or a
   debug-signed artifact.
4. Complete App access instructions. The source sign-in path is email OTP;
   provide a valid reviewer/tester account and the real OTP delivery procedure.
   Do not invent credentials in this report.
5. Complete Target audience and content. Source behavior is 18+ only with an
   in-app age gate; select the truthful Console option and enable minor
   restriction only after Owner/Play review.
6. Complete Data Safety from the exact AAB, active API, and all SDK/provider
   behavior. Candidate source categories requiring owner confirmation include
   email/authentication, microphone/voice, platform-stored recordings, Listener
   profile data, KYC identity data, wallet/payment data, call/safety metadata,
   and deletion/retention handling. Confirm collection, sharing, purposes,
   encryption in transit, retention, and deletion answers. Data Safety includes
   third-party SDK behavior and is required for closed-test tracks; see
   [Google’s Data Safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
7. Record the audio/voice declaration consistently with the active recording
   provider. The source’s recording notice must remain prominent before
   microphone/media access; do not reuse older “recording off” notes.
8. Add and verify the active privacy-policy URL in the listing and in-app
   bootstrap. Current public privacy is HTTP 200, but canonical bootstrap is
   currently HTTP 404.
9. Add and verify the account-deletion URL and answer the Data Safety deletion
   questions. The current public deletion page is HTTP 200; verify that it
   actually covers account and associated-data deletion.
10. Determine whether the app is in scope for Play’s Child Safety Standards.
    If required, publish a functional, globally accessible Child Safety/CSAE
    standards page, in-app reporting mechanism, and child-safety point of
    contact, then complete the Console declaration. The expected source URL
    currently returns 404. See [Google’s Child Safety Standards guidance](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en).
11. Complete the IARC content-rating questionnaire from actual behavior; do not
    infer the rating from the 18+ copy alone.
12. Upload the approved 512x512 icon, 1024x500 feature graphic, and actual
    phone screenshots; complete listing text and alt text.
13. Add the genuine tester email list, publish the closed-test release, and
    generate the tester opt-in URL only after the track is installable.
14. Resolve the prepaid-wallet/external-payment policy question with Google
    Play policy before enabling paid production behavior. No payment SDK or
    Play Billing permission is embedded in this Android source.

## Tester Day-0 procedure

Do not timestamp Day-0 when invitations are sent. Google’s current requirement
for newly created personal developer accounts is at least 12 testers opted in
continuously for at least 14 days; the official guidance also says an opt-out
and later re-opt-in breaks that tester’s consecutive period. See [Google’s
closed-testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

When Console is ready:

1. Upload the final release/upload-signed AAB and record package, version name,
   versionCode, SHA-256, signing fingerprint, and Play artifact ID.
2. Assign the artifact to the Closed testing track and publish the test.
3. Add the tester list/group and send the Play opt-in URL.
4. Have each genuine tester open the opt-in URL with the Google account that
   will test, explicitly opt in, install from Google Play, and report the
   installed version.
5. Verify at least 12 unique genuine opt-ins in Console. Email delivery alone
   does not count.
6. Record `DAY_0_UTC` only after the Console count is at least 12 and the track
   shows those users as opted in.
7. Maintain a daily UTC log for Day 0 through Day 13: timestamp, unique
   opted-in count, version code, opt-out/re-opt-in events, install/access
   issues, executed smoke cases, crashes, network, and remediation. Keep
   tester data minimized and access-controlled.

## Physical-device smoke plan

These are test cases, not claimed results. Every case must be executed on the
installed release candidate before being marked PASS:

1. Install/launch from the Closed-test Play listing; verify package/version and
   no debug-signing or debug-only UI.
2. Email login, six-digit OTP, session restore, logout, and re-login.
3. Microphone disclosure and Android microphone permission; confirm no camera
   or storage permission prompt.
4. Caller starts an Internet Voice call; Listener receives it; RealtimeKit join
   completes; both parties hear and can speak.
5. Confirm both recording consents are captured and provider-confirmed recording
   is active before any billing starts.
6. Mute/unmute on both sides.
7. Drop and restore connectivity; confirm RealtimeKit reconnect and safe billing
   behavior.
8. Route audio through Bluetooth, speaker, and earpiece; verify no stuck mic or
   remote-audio loss.
9. Hang up from each side; execute Safety Exit; verify terminal state and
   idempotency.
10. From a completed call, submit report and block; verify the counterparty is
    not offered again.
11. Let a call go unanswered; verify missed/no-answer state and zero caller
    charge/listener earning.
12. Repeat the critical flow with an Iran-network device and a second-network
    participant. Record the networks, route, RealtimeKit state, and any relay
    or bootstrap failure.

## External blockers and exact Owner Actions

1. **OWNER/EAS:** authenticate the correct Expo account, verify project
   `58b9f62d-db82-421a-ad59-edccac70c316`, and inspect Android credentials.
2. **OWNER/SIGNING:** establish continuity with the existing Play/EAS upload
   identity. Supply it through EAS or another approved secure path; do not
   commit, print, or replace it without an explicit decision.
3. **OWNER/EAS:** produce a fresh Production AAB from this exact Android source
   line, then archive its path, SHA-256, version identity, certificate
   fingerprint, release-signing proof, manifest, and secret scan.
4. **OWNER/BACKEND + WEB:** repair the canonical API alias and verify `/health`,
   `/v1/bootstrap`, legal payload, RealtimeKit participant auth, recording
   provider, Voice preset, and live media behavior. Do not switch to the retired
   `theta` origin.
5. **OWNER/POLICY:** settle the Play Data Safety, voice-recording, child-safety,
   content-rating, account-deletion, and wallet/external-payment declarations
   against live behavior.
6. **OWNER/PLAY-CONSOLE:** complete the listing, assets, App access, tester
   group, track release, and opt-in URL.
7. **OWNER/DEVICE QA:** provide at least one supported Android device/emulator,
   an Iran-network path, and a second-network participant; execute the smoke
   plan and retain evidence.

No Play upload, Production release, signing-key creation, credential mutation,
or purchase was performed by W66.

W66_ANDROID_CLOSED_TEST_DAY0_BLOCKED
