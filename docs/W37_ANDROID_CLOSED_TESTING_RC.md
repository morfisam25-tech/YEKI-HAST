# W37 Android Closed Testing RC

## Release identity

- Branch: `w37/android-closed-testing-rc-20260913`
- Exact base: `0e94ed52ef55f04602d59d977c82b5c9fbe5d05a`
- Package/applicationId: `app.yekihast.mobile`
- App label: `یکی هست`
- Version code: `8` (the repository records vc7 as retired and no newer uploaded AAB)
- Version name: `1.0.0`
- Build system: Expo SDK 57 managed source, locally prebuilt to Gradle
- Node: `22.23.1`
- npm: `10.9.8`
- Java: Eclipse Temurin `17.0.20.1+1`
- Gradle: `9.3.1`
- Android build-tools: `36.0.0` (plus dependency-requested `35.0.0`)
- compileSdk/targetSdk: `36` / `36`
- minSdk: `24`
- NDK: `27.1.12297006`

## API host behavior

`apps/mobile/src/api.ts` reads `process.env.EXPO_PUBLIC_API_BASE_URL`, strips one trailing slash, and uses the source-locked canonical fallback `https://yeki-hast-unique-6ff0.vercel.app`. Expo replaces `EXPO_PUBLIC_*` references at bundle time, so the production URL is compile-time embedded rather than remotely switchable. Both preview and production EAS profiles explicitly provide the same URL.

Source intent is unambiguous: the EAS profiles, Web/Admin production locks, deployment workflow, launch-status record, and release guards identify `unique-6ff0` as canonical. The retired `theta` fallback was removed from mobile source in W37.

Live verification on 2026-09-13 is **BLOCKED**:

- `https://yeki-hast-unique-6ff0.vercel.app/health` -> HTTP 404
- `https://yeki-hast-unique-6ff0.vercel.app/v1/bootstrap` -> HTTP 404
- retired `https://yeki-hast-theta.vercel.app/health` -> HTTP 200 from older API `0.0.10`
- retired `theta` bootstrap -> HTTP 200 but older/incomplete payload (including no Child Safety URL)

Do not switch the candidate back to `theta`. The source-designated canonical alias must serve the expected W33-compatible health/bootstrap routes before an upload build is made.

## Public legal and product truth

The mobile app receives Privacy Policy, Terms, Account Deletion, Child Safety, and support contact only from the API bootstrap legal object. No legal URL or support address is hardcoded in the mobile UI. Source tests cover the shared bootstrap configuration and the 18+, human Listener, non-therapy/non-medical/non-dating/non-emergency, platform-recording-off, and self-declared-profile truths.

Live legal verification is **BLOCKED** because the currently deployed public site predates W33:

- `https://yekihast.app/privacy` -> HTTP 200
- `https://yekihast.app/terms` -> HTTP 200
- `https://yekihast.app/account/delete` -> HTTP 200
- `https://yekihast.app/safety/children` -> HTTP 404
- `https://yekihast.app/safety` -> HTTP 404
- `https://yekihast.app/trust` -> HTTP 404

The W33 source-locked Child Safety URL is truthful, but it must exist publicly and be returned by the canonical API bootstrap before Closed Testing upload.

## Android permissions

Bundletool inspection of the final base manifest records exactly these requested permissions:

- `android.permission.RECORD_AUDIO` — **REQUIRED**, user-granted microphone access for WebRTC voice.
- `android.permission.INTERNET` — **REQUIRED**, bootstrap/API/WebRTC signaling and TURN connectivity.
- `android.permission.ACCESS_NETWORK_STATE` — **INHERITED BY DEPENDENCY**, network-state handling.
- `android.permission.MODIFY_AUDIO_SETTINGS` — **INHERITED BY DEPENDENCY / REQUIRED**, WebRTC audio routing.
- `android.permission.BLUETOOTH` — **INHERITED BY DEPENDENCY**, legacy audio-device routing; no modern Nearby Devices permission is declared.
- `android.permission.VIBRATE` — **INHERITED BY DEPENDENCY**; no application vibration feature was found.
- `android.permission.WAKE_LOCK` — **INHERITED BY DEPENDENCY**, runtime/keep-awake support.
- `android.permission.USE_BIOMETRIC` — **INHERITED BY EXPO SECURESTORE**, optional biometric protection support; the app does not force biometric authentication.
- `android.permission.USE_FINGERPRINT` — **INHERITED BY EXPO SECURESTORE**, backward-compatible optional biometric support.
- `app.yekihast.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — **ANDROIDX INTERNAL**, signature-level protection for non-exported dynamic receivers.

Camera, storage/media read/write, dump, and system-alert-window permissions are not requested by the application. No contacts, location, phone/SMS, advertising-ID, foreground-service, or notification runtime permission is requested. The manifest contains AndroidX's protected Profile Installer receiver (guarded by the system `DUMP` permission) and WebRTC's non-exported media-projection service; neither adds a requested permission.

## Mobile SDK and disclosure inventory

- Ads SDK: **NO**
- Analytics SDK: **NO**
- Crash-reporting SDK: **NO**
- Payment SDK: **NO** (the UI calls first-party wallet/payment APIs; no provider SDK is embedded)
- WebRTC SDK: **YES**, `react-native-webrtc 124.0.8` with its Expo config plugin
- Tracking SDK: **NO**
- Auth SDK: **NO third-party SDK**; first-party email/session API calls
- Push SDK: **NO**
- Storage SDK: Expo SecureStore only for the session token
- Device identifier/advertising SDK: **NO**

The lockfile audit reports 12 production-tree advisories (one high and eleven moderate) in Expo CLI/config/prebuild-time paths such as `js-yaml`, `xcode`, and `uuid`. They must be re-evaluated against the built AAB; no analytics, ads, or tracking package was found.

## Signing and artifact

No upload keystore, release-signing environment hook, or local release credential was found. Expo prebuild generated only the standard debug keystore and configured the generated release variant to use it. No permanent key was created.

- Signing status: **RELEASE_SIGNING_OWNER_ACTION_REQUIRED**
- Required non-secret owner action: provide the existing Google Play upload keystore through an approved secure signing path (or authorize its creation/registration if no upload key exists), including the expected alias/password inputs without committing or printing them.
- Local verification AAB: **CREATED** with `NODE_ENV=production`
- Artifact filename: `yeki-hast-w37-v1.0.0-vc8-local-debug-signed.aab`
- SHA-256: `65B040A8036CF1252914F9A64BFB62C5727C71C5FC3446F2A1FFC6F5F144A269`
- Size: `67,745,649 bytes`
- Release-signed for Play upload: **NO**

The local AAB is signed by the generated `Android Debug` certificate (SHA-256 fingerprint `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`). It is an inspection candidate only and must not be uploaded to Play.

## Verification

- `npm ci` under Node 22.23.1/npm 10.9.8: **PASS**
- Mobile typecheck: **PASS**
- Targeted mobile/W33/legal/18+/recording/store tests: **PASS** (57/57)
- Full repository suite: **PASS** (704/704)
- Production Android export: **PASS**; exported Hermes bundle contains `unique-6ff0`, not `theta`
- Native Gradle `bundleRelease` with `NODE_ENV=production`: **PASS**
- Artifact identity via bundletool 1.18.3: **PASS** (`app.yekihast.mobile`, vc8, `1.0.0`, min 24, target/compile 36)
- Artifact API scan: **PASS**; canonical `unique-6ff0` is embedded and no retired `theta`, localhost, or loopback API origin was found
- Native packaging: **PASS**; Hermes/React Native/Expo libraries and WebRTC `libjingle_peerconnection_so.so` are present for arm64-v8a, armeabi-v7a, x86, and x86_64
- Signature integrity: **PASS for local inspection**, but **NOT PLAY READY** because it uses the generated debug certificate
- Runtime smoke: **BLOCKED**; no connected Android device/emulator was available, and the canonical bootstrap is currently HTTP 404

## Closed Testing blocker classification

### A. Must fix before Closed Test upload

1. Make the source-designated canonical API alias `yeki-hast-unique-6ff0.vercel.app` serve `/health` and a W33-compatible `/v1/bootstrap`; independently verify its release and payload. Do not use the retired `theta` runtime.
2. Publish the W33 public/legal routes so the canonical Child Safety, Safety, and Trust URLs resolve, and verify bootstrap returns all five legal/support fields with `legal.ready=true`.
3. Provide the existing Google Play upload-signing credential through an approved secure path; then produce and inspect a fresh upload-signed vc8 AAB.
4. Run the upload-signed candidate on a supported device/emulator and verify launch, bootstrap/legal loading, 18+ copy, intended Caller gate, recording-off copy, and no TLS/network failure.

### B. Can fix during the 14-day Closed Test

- Resolve or formally accept the Expo build-tool dependency advisories after confirming they do not ship as exploitable app runtime code.
- Complete/polish Store listing graphics and screenshots if the Console allows the Closed Test rollout to begin without delaying tester access.
- Exercise broader device/API-level and network-condition coverage without real paid calls or provider OTP.
- Remove unreferenced legacy mobile phone-verification source in a later cleanup; it is not imported into the candidate bundle.

### C. Required only before public production release

- Public paid Caller launch/provider approvals, payment policy resolution, provider activation, KYC/payout/OTP production readiness, and production commercial-hosting gates.
- Final legal operator/address/retention/jurisdiction/provider-region facts identified by W33.
- Public-production listing polish and final public-launch review.

## Scope attestation

- Production changed: **NO**
- Play upload: **NO**
- Main changed: **NO**
- GitHub Actions: **NOT RUN**
