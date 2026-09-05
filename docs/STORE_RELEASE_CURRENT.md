# یکی هست — Current Store Release Status

Last verified: 2026-09-05

This file is the authoritative current Store-release status. When older Store docs conflict with it, use this file and `GOOGLE_PLAY_FINAL_PACKET.md`.

## Production runtime — VERIFIED

- Repository: `morfisam25-tech/YEKI-HAST`
- Current runtime/config `main`: `501c5227ea288a451301f5ce7e81ae7b652539f6`
- `main` includes the Android Store permission hardening merged through PR #26.
- Web production release V2: Actions run `33931970953` — SUCCESS.
- Web production deployment: `dpl_CjotkNAvNfYQq2T7pjZrfa9tCvjF` — READY.
- Production API: `https://yeki-hast-unique-6ff0.vercel.app`.
- No API/Admin/DB redeploy is required merely for Store metadata preparation.

## Public Store URLs — USE THESE

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

Primary-domain `/`, `/privacy`, `/terms`, and `/account/delete` were production-smoke-tested. Secondary/www domains redirect to the primary domain.

## Account deletion — STORE-READY

- clean account -> physical deletion;
- retention-sensitive account -> `202 review_required`;
- active operations admin -> `409` before destructive side effects;
- public reviewer-facing deletion page -> `https://yekihast.app/account/delete`.

Do not describe the current implementation as support-only or request-only deletion.

## Mobile identity

- App: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Expo SDK: `~57.0.9`
- Android target baseline: API 36
- iOS/Xcode baseline: 26

## Expo / EAS access — VERIFIED

Verification run `33941384314` succeeded.

- authenticated Expo identity: `saimorfi`;
- owner access to `saimorfi` and `saimorfis-team`;
- exact EAS project: `@saimorfis-team/yeki-hast`;
- project ID matches the value above;
- Expo plan observed: Free;
- no replacement Expo project or credential is needed.

## Production artwork — LOCKED

Approved direction: black/graphite 3D tile with warm gold/ivory opposing conversation bubbles and no text.

Deterministic generator: `apps/mobile/scripts/generate-artwork.mjs`.

Generated release assets include:

- app icon 1024×1024;
- Android adaptive foreground 1024×1024;
- Android monochrome mark 1024×1024;
- Google Play listing icon 512×512;
- Google Play feature graphic 1024×500 opaque PNG.

Do not reopen the icon direction unless a Store returns a concrete technical rejection.

## Android signed Store binary — FINAL BINARY COMPLETE

The old versionCode 2 AAB is superseded. Use only the hardened versionCode 3 release.

Final build facts:

- GitHub build workflow run: `33946371769` — SUCCESS;
- source commit: `cee6d1f545e166ff27b8b71e5c7f422af9e7cb1a`;
- runtime/config parent: `501c5227ea288a451301f5ce7e81ae7b652539f6`;
- app version: `1.0.0`;
- versionCode: `3`;
- package: `app.yekihast.mobile`;
- distribution: Store;
- profile: production;
- final AAB SHA-256: `8cbf19c57352ad8aa2a8d08c01e48e7d9f76581f3d05c36e99264a4df8d43cd3`;
- existing EAS-managed Android signing key retained.

Exact AAB verification has confirmed:

- archive/signature integrity;
- package identity;
- Android 16 / targetSdkVersion 36;
- no requested camera, microphone, location, contacts, SMS/call-log or advertising-ID permission;
- unused overlay and legacy external-storage permissions were removed before this build.

Do not rebuild Android unless app/runtime source changes or Google Play returns an evidence-backed binary problem.

## Android Store screenshots — ACTIVE FINAL QA

The first Linux emulator attempt failed because the GitHub-hosted Linux runner had no KVM hardware acceleration and the API 36 emulator timed out before boot. This was an infrastructure limitation, not an app failure.

The screenshot workflow was moved to an accelerated macOS ARM64 runner. Current run:

- Actions run: `33947827376`;
- exact input: final versionCode 3 AAB with the SHA-256 above;
- state at last verification: in progress.

The screenshots must come from the actual final AAB and must not expose real email, OTP, session/admin data or secrets. No speculative Caller/payment/KYC screenshots are allowed.

## Google Play filing packet — READY

Use `docs/GOOGLE_PLAY_FINAL_PACKET.md` for:

- listing copy;
- reviewer access path;
- Data Safety evidence baseline;
- SDK/permission/ads baseline;
- policy/content questionnaire baseline;
- exact Android binary identity;
- external-only Play Console steps.

The repository-side Google Play preparation is therefore reduced to finishing the screenshot QA. The remaining Play work after that requires an actual Google Play developer account / console.

## Google Play developer account evidence

Connected Gmail accounts were searched for clear Google Play Console / developer-account registration evidence. No reliable existing developer-account registration confirmation was found. Generic consumer Google Play emails are not evidence of a Play Console developer account.

Therefore do not assume a developer account already exists. Account creation/verification and any registration fee remain external owner-controlled steps.

## iOS / Apple — INTENTIONALLY PARKED

The last production iOS attempt reached remote credentials and stopped because the Distribution Certificate was not validated for non-interactive builds. Apple setup is intentionally parked while Android is completed first.

Do not perform Apple purchases, membership enrollment, credential changes or iOS retries until the owner resumes the Apple phase.

## Remaining work, in order

### Android-first

1. Finish exact-AAB screenshot capture/QC.
2. Confirm or create the Google Play developer account and complete required identity/organization verification.
3. Pay any Google registration fee only after explicit owner approval.
4. Create the Play app record for `app.yekihast.mobile`.
5. Upload the exact versionCode 3 AAB and locked Store assets.
6. File listing/App access/Data Safety/content rating/target audience/Ads declarations from `GOOGLE_PLAY_FINAL_PACKET.md`.
7. Run Play pre-launch/review checks and fix only evidence-backed findings.
8. Submit to the selected track after the exact uploaded artifact passes the desired smoke gate.

### Apple later

1. Resume one-time interactive Apple/EAS production signing setup.
2. Build signed iOS IPA.
3. Complete App Store Connect filing and submission.

## Do not do

- Do not rerun Production DB migrations.
- Do not redeploy API/Admin without a real source/config change requiring it.
- Do not open Caller/payment/KYC/payout/telephony/SMS gates for Store cosmetics.
- Do not replace Android signing credentials.
- Do not put Expo/Apple/Google/signing secrets in source, logs or chat.
- Do not touch Evidence Axis.
