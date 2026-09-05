# یکی هست — Mobile Store Release Handoff

Last reconciled: 2026-09-05

This document is the cross-platform Store handoff/index. It no longer describes pre-build readiness. When facts conflict, use `STORE_RELEASE_CURRENT.md` first, then the platform-specific final packet.

## Product identity

- App: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Production API: `https://yeki-hast-unique-6ff0.vercel.app`
- Primary product domain: `https://yekihast.app`

Application IDs are locked unless a Store returns a concrete collision/rejection.

## Public policy/support surfaces — verified

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

Do not use the older Vercel Web URLs for Store metadata.

## Expo / EAS — verified

Expo/EAS access is no longer an unresolved source declaration.

Verified project/account identity:

- authenticated Expo identity had owner access to `saimorfis-team`;
- project resolves to `@saimorfis-team/yeki-hast`;
- EAS project ID matches `58b9f62d-db82-421a-ad59-edccac70c316`;
- Expo Free plan was verified before production builds;
- repository Actions secret `EXPO_TOKEN` is present and must never be exposed in chat/logs/source.

Do not create a replacement Expo project.

## Production artwork — complete/locked

The final icon direction is approved and wired through the deterministic mobile artwork generator.

Generated release assets include:

- standard 1024×1024 app icon;
- Android adaptive foreground;
- Android monochrome/themed mark;
- Google Play 512×512 listing icon;
- Google Play 1024×500 opaque feature graphic is also prepared/QC'd.

Artwork is not a current blocker. Do not reopen the icon decision unless a Store gives a concrete technical rejection.

## Android — current release path

Android is the active first Store path.

Final signed Android Store artifact:

- app version: `1.0.0`;
- versionCode: `3`;
- package: `app.yekihast.mobile`;
- target SDK: Android 16 / API 36;
- final AAB SHA-256: `8cbf19c57352ad8aa2a8d08c01e48e7d9f76581f3d05c36e99264a4df8d43cd3`;
- existing EAS-managed Android keystore retained;
- exact AAB integrity/package/version/target-SDK/permission checks passed.

The earlier versionCode `2` AAB is superseded. Do not upload it.

Use `docs/GOOGLE_PLAY_FINAL_PACKET.md` for final Store copy/Data Safety/reviewer answers.

## Android screenshot path

Hosted GitHub Android emulator capture is closed for this release because both tested runner paths failed at virtualization level before Android booted:

- Linux: no usable KVM acceleration;
- macOS ARM64: `HVF_UNSUPPORTED`.

Do not retry those workflows.

Physical-device screenshot kit:

- source: exact final versionCode `3` AAB;
- Actions run: `33948412172` — SUCCESS;
- artifact name: `yeki-hast-android-screenshot-kit-v1.0.0-vc3`;
- includes release-equivalent installable screenshot APK, Windows ADB helpers, checksums and capture instructions;
- screenshot-only APK uses a disposable QA key and MUST NOT be uploaded to Google Play.

Remaining screenshot work is physical-device capture/QC only.

## Google Play account — owner/external gate

Use `docs/GOOGLE_PLAY_ACCOUNT_READINESS.md`.

Before signup:

1. owner confirms exact legal publishing entity;
2. if publishing as a real business, use the correct Organization path and matching D-U-N-S/payments-profile/company evidence;
3. verify contact/developer email and phone;
4. stop before any registration payment until explicit owner approval;
5. after account activation, create app record for `app.yekihast.mobile`, upload the exact versionCode `3` AAB, complete Console forms, upload real screenshots/locked graphics, then run Play review/pre-launch checks.

No Store-account action requires rebuilding the Android binary.

## iOS — parked on external signing setup

iOS source/export is not being discarded; it is intentionally parked while Android-first work closes.

Known state:

- EAS project identity/auth passed;
- remote iOS credentials were found;
- production build reached credential setup;
- build stopped with `Distribution Certificate is not validated for non-interactive builds`;
- one-time interactive Apple/EAS Distribution Certificate + provisioning-profile validation is required;
- no signed IPA was produced from that attempt.

Do not resume Apple setup, create replacement credentials, enroll/pay for Apple Developer membership, or rerun iOS production without explicit owner direction.

When Apple work resumes, use the exact current source and recheck App Store Connect privacy/listing forms against the successful signed IPA.

## Current Technical Beta behavior

Store claims must match active behavior:

- email OTP authentication is active;
- listener profile/onboarding/training/assessment is active;
- Privacy/Terms/Account Deletion/Support are exposed;
- Caller voice, payment, KYC, payout, telephony and production phone/SMS remain disabled/fail-closed;
- do not market closed capabilities as active.

## Current source-of-truth map

- `docs/STORE_RELEASE_CURRENT.md` — overall live Store status.
- `docs/GOOGLE_PLAY_FINAL_PACKET.md` — authoritative Android filing packet.
- `docs/GOOGLE_PLAY_ACCOUNT_READINESS.md` — developer-account/organization gate.
- `docs/STORE_SUBMISSION_ANSWERS.md` — compatibility pointer, not an independent filing source.
- this file — cross-platform handoff/index.

## Do not do

- Do not rerun Production DB migrations for Store work.
- Do not redeploy API/Admin without an actual runtime/config reason.
- Do not replace Android signing credentials.
- Do not rebuild Android merely for listing/account/screenshot changes.
- Do not retry hosted emulator capture workflows.
- Do not upload the screenshot-only APK to Google Play.
- Do not open Caller/payment/KYC/payout/telephony/SMS gates for Store cosmetics.
- Do not expose Expo/Apple/Google/signing credentials or OTPs.
- Do not touch Evidence Axis.
