# یکی هست — Current Store Release Status

Last verified: 2026-09-07

This file is the authoritative current Store-release status. When older Store docs conflict with it, use this file and `GOOGLE_PLAY_FINAL_PACKET.md`.

## Production runtime — VERIFIED

- Repository: `morfisam25-tech/YEKI-HAST`
- Current application tree baseline: tree `587f67f0c1a07e9dc5927190fd05ceb97d9e7532`
- Current `main` before this documentation branch: `98b9ac64fcea88ec5b18e239e51a064c49f01620`
- Foundation QA on the v1.2 privacy/store application source passed, including Android native prebuild/export.
- Web v1.2 privacy release: Actions run `34154499532` — SUCCESS.
- Web production deployment: `dpl_2wbYQGhLUSxTD1yhY59kAoTCmZJy` — READY.
- Production API: `https://yeki-hast-unique-6ff0.vercel.app`.
- Production API `/health` and `/ready` both returned HTTP 200 after the Web release.

No Production DB migration is required for Store filing.

## Public Store URLs

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

The primary-domain surfaces were verified by the guarded Web V2 release workflow.

## Account deletion

- clean account -> physical deletion;
- retention-sensitive account -> review/retention state;
- active operations admin -> blocked before destructive side effects;
- public deletion resource -> `https://yekihast.app/account/delete`.

## Mobile identity

- App: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Android target SDK: API 36 / Android 16

## Android signed Store binary — FINAL vc5

Use only this Android Store AAB:

- EAS build ID: `51dc645a-b56f-4428-91b5-73337898f870`;
- source commit recorded by EAS: `c2e2918c9ae171bf03f9b603f5bc665d00f3db0f`;
- app version: `1.0.0`;
- versionCode: `5`;
- package: `app.yekihast.mobile`;
- distribution: `STORE`;
- build profile: `production`;
- targetSdkVersion: `36`;
- final AAB SHA-256: `f843909c6a239d784f38c97c304310a64a7e4ab5c59410cd905de8b89bd06e32`;
- signing credential: existing EAS-managed `Build Credentials 9ASUP-JZQW (default)`; no replacement credential was created.

Exact-binary checks passed:

- archive integrity;
- `jarsigner` verification;
- package/version/versionCode;
- target SDK 36;
- requested-permission audit.

Requested Android permissions in the exact vc5 AAB are:

- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.BLUETOOTH`
- `android.permission.INTERNET`
- `android.permission.MODIFY_AUDIO_SETTINGS`
- `android.permission.RECORD_AUDIO`
- `android.permission.USE_BIOMETRIC`
- `android.permission.USE_FINGERPRINT`
- `android.permission.VIBRATE`
- `android.permission.WAKE_LOCK`
- app-scoped `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

The AAB does **not** request camera, location, contacts, phone/call-log, SMS, advertising ID, overlay, legacy external storage, media-read, or `android.permission.DUMP`.

### DUMP verifier correction

The first vc5 verification run incorrectly treated any appearance of `android.permission.DUMP` anywhere in the merged manifest as an app-requested permission. AndroidX ProfileInstaller uses `android:permission="android.permission.DUMP"` to protect its exported receiver; that is not a `<uses-permission>` request by the app.

Forensic run `34156081233` dumped the exact vc5 manifest and confirmed `DUMP` appears only as a receiver protection permission. The corrected audit checks only `<uses-permission>` entries. No Android rebuild was required.

## Final vc5 AAB archival backup

The exact vc5 AAB was downloaded from the completed EAS build, checksum-verified, inspected with bundletool, signature-verified, and copied to a GitHub Actions artifact without rebuilding.

- archive/verification run: `34156200702` — SUCCESS;
- artifact: `yeki-hast-final-android-aab-v1.0.0-vc5-v1.2`;
- artifact ID: `10031041956`;
- artifact digest: `sha256:eb6026c5d6a0827cb0881e8ff0048e041be4aaf0e88a1ba271c8bd3bcb831d2a`;
- artifact expiry: `2026-12-06`;
- archive contains the exact `.aab`, SHA-256 file, dumped manifest and requested-permission list.

Upload the `.aab` inside the artifact to Google Play, not the outer artifact ZIP.

## Privacy / microphone / Internet Voice

The v1.2 privacy page is live and states the current Internet Voice behavior:

- microphone access is used for live Internet Voice when that feature is used;
- media uses WebRTC and may traverse a TURN relay when direct peer connectivity is unavailable;
- the application has no implemented conversation-audio recording/storage path;
- do not claim that audio is never processed or never leaves the device.

Google Play filing must therefore use **Microphone: Yes**. Older Store documents saying Microphone: No are superseded.

For Data Safety, Google defines collection as transmitting user data off-device and requires ephemeral processing to be represented in the form response even when it is not displayed as retained collection. Current live voice is intended to be transient real-time media, not stored audio. Use `GOOGLE_PLAY_FINAL_PACKET.md` for the filing baseline and recheck the exact TURN/provider role before final submission.

## Android screenshots — vc5 kit READY

The old vc3 screenshot kit is superseded.

A new physical-device kit was derived from the exact final vc5 Store AAB without rebuilding the Store binary:

- kit run: `34156520738` — SUCCESS;
- artifact: `yeki-hast-android-screenshot-kit-v1.0.0-vc5`;
- artifact ID: `10031149382`;
- artifact digest: `sha256:8060d391e4f05fda0a63437fcbc7156e9e69d0f6bd62b841f7d4fc1d2493f54f`;
- artifact expiry: `2026-12-06`;
- source AAB checksum was verified against the locked vc5 SHA before APK derivation;
- the kit contains a universal APK derived from vc5, Windows ADB install/open and screenshot helpers, checksums and safety instructions;
- the APK is re-signed with a disposable screenshot-only key and **MUST NOT** be uploaded to Google Play.

Hosted Android emulator capture remains closed because the previously tested GitHub-hosted KVM/HVF paths failed before Android booted. Do not spend Actions budget retrying hosted emulators.

Final screenshot capture itself still requires a physical Android device. Use safe test data only; never expose real email, OTP, session/admin data or secrets.

## Google Play account gate

The remaining Google Play account work is external/owner-controlled:

1. confirm the exact legal publishing entity;
2. use the appropriate Organization account path for a genuine business publisher;
3. obtain/confirm the matching D-U-N-S and payments-profile evidence;
4. complete identity/contact verification;
5. stop before any registration payment until explicit owner approval;
6. create the Play app record for `app.yekihast.mobile`;
7. upload the exact vc5 AAB and current Store assets/forms.

## iOS / Apple — parked

iOS remains intentionally parked. The known external blocker is one-time interactive Apple/EAS Distribution Certificate and provisioning-profile validation. Do not create replacement Apple credentials or resume iOS work without owner direction.

## Remaining Android-first work

1. Capture/QC current vc5 screenshots on a real Android device using artifact `10031149382`.
2. Complete Google Play developer-account organization/identity setup.
3. Pay any Google registration fee only after explicit owner approval.
4. Create the app record for `app.yekihast.mobile`.
5. Upload the exact vc5 AAB and locked artwork.
6. File listing/App access/Data Safety/content/target-audience/Ads declarations from `GOOGLE_PLAY_FINAL_PACKET.md`.
7. Confirm the final production TURN/provider role before locking the live-audio Shared answer.
8. Run Play pre-launch/review checks and fix only evidence-backed findings.
9. Submit to the selected track after the exact uploaded artifact passes the desired smoke/review gate.

## Do not do

- Do not use vc2, vc3 or vc4 as the final Store binary.
- Do not rebuild Android without a real binary/runtime reason.
- Do not claim Microphone: No for vc5.
- Do not treat receiver `android:permission="android.permission.DUMP"` as an app-requested permission.
- Do not retry hosted Android emulator screenshot workflows.
- Do not upload the screenshot-only APK to Google Play.
- Do not rerun Production DB migrations for Store work.
- Do not replace Android signing credentials.
- Do not open payment/KYC/payout/telephony/SMS gates for Store cosmetics.
- Do not expose credentials, OTPs, signing material or private keys.
- Do not touch Evidence Axis.
