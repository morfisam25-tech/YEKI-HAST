# یکی هست — Mobile Store Release Handoff

Last reconciled: 2026-09-07

This document is the cross-platform Store handoff/index. When facts conflict, use `STORE_RELEASE_CURRENT.md` first, then the platform-specific final packet.

## Product identity

- App: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Production API: `https://yeki-hast-unique-6ff0.vercel.app`
- Primary product domain: `https://yekihast.app`

## Public policy/support surfaces

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

The Privacy page is being reconciled to the verified closed Caller/voice production state before final Play submission.

## Expo / EAS

Verified project/account identity:

- authenticated Expo identity: `saimorfi`;
- owner access to `saimorfi` and `saimorfis-team`;
- project: `@saimorfis-team/yeki-hast`;
- EAS project ID matches `58b9f62d-db82-421a-ad59-edccac70c316`;
- repository Actions secret `EXPO_TOKEN` is present and must never be exposed;
- existing Android keystore `Build Credentials 9ASUP-JZQW (default)` remains in use.

Do not create a replacement Expo project or Android signing key.

## Production artwork

The approved black/graphite + warm gold/ivory conversation-bubble direction remains locked. Existing generated app/listing icon and Google Play feature graphic remain usable; no artwork rebuild is required because of vc5.

## Android — final release path

Final signed Android Store artifact:

- EAS build ID: `51dc645a-b56f-4428-91b5-73337898f870`;
- source commit: `c2e2918c9ae171bf03f9b603f5bc665d00f3db0f`;
- app version: `1.0.0`;
- versionCode: `5`;
- package: `app.yekihast.mobile`;
- target SDK: Android 16 / API 36;
- distribution/profile: `STORE` / `production`;
- final AAB SHA-256: `f843909c6a239d784f38c97c304310a64a7e4ab5c59410cd905de8b89bd06e32`;
- existing EAS-managed Android keystore retained.

Exact AAB verification confirmed archive/signature integrity, package/version/versionCode, target SDK 36 and the requested-permission surface.

Requested permissions include `RECORD_AUDIO` for the implemented v1.2 Internet Voice capability. The exact AAB does not request camera, location, contacts, phone/call-log, SMS, advertising ID, overlay or external-storage/media-read access.

The earlier verification failure on `android.permission.DUMP` was a false positive: AndroidX ProfileInstaller uses DUMP as the permission protecting an exported receiver, not as an app-requested `<uses-permission>`. Corrected forensic run `34156081233` confirmed this on the exact vc5 AAB.

## vc5 archival backup

- verification/archive run: `34156200702` — SUCCESS;
- artifact: `yeki-hast-final-android-aab-v1.0.0-vc5-v1.2`;
- artifact ID: `10031041956`;
- artifact digest: `sha256:eb6026c5d6a0827cb0881e8ff0048e041be4aaf0e88a1ba271c8bd3bcb831d2a`;
- expiry: `2026-12-06`.

The artifact contains the exact vc5 AAB plus checksum, manifest and requested-permission evidence. Upload the `.aab`, not the outer artifact ZIP, to Google Play.

## v1.2 Internet Voice — implementation vs production availability

The vc5 binary contains the Internet Voice/WebRTC implementation and `RECORD_AUDIO`, but the current public production gate is closed.

Verified production audit results:

- TURN/provider audit `34161228428` — SUCCESS;
- Caller gate audit `34161306558` — SUCCESS;
- `CALLER_CLOSED_BETA_ENABLED=false`;
- `COMMERCIAL_HOSTING_APPROVED=false`;
- no production TURN/ICE relay configuration;
- no Iran TURN/domestic control plane;
- production bootstrap reports `callerClosedBetaEnabled=false`.

Therefore current Store/privacy semantics are:

- Android Microphone permission in the AAB: **Yes**;
- operational public Caller/Internet Voice: **No**;
- current conversation-audio collection: **No**;
- current conversation-audio sharing: **No**;
- backend conversation-audio recording/storage path: not implemented.

Google Play Data Safety must describe the behavior actually reachable in the submitted production environment, not merely dormant code or manifest permissions. Before Caller/Internet Voice is enabled later, re-file Privacy/Data Safety against the actual then-active WebRTC/TURN/provider behavior.

## Android screenshots

The old vc3 screenshot kit is no longer release-equivalent to the final vc5 Store binary. Hosted emulator capture remains closed because the previously tested GitHub-hosted Linux/macOS virtualization paths failed before Android booted.

Use the physical-device vc5 screenshot kit:

- artifact ID: `10031149382`;
- artifact: `yeki-hast-android-screenshot-kit-v1.0.0-vc5`;
- source AAB checksum is locked to the final vc5 SHA.

Capture only real current states. Do not fabricate active Caller/voice/payment/KYC screens. Do not expose real email, OTP, session/admin data or secrets.

## Google Play account — external gate

Before signup:

1. confirm the exact legal publishing entity;
2. for a real business publisher, use the appropriate Organization path with matching D-U-N-S/payments-profile/company evidence;
3. verify contact/developer email and phone;
4. stop before any registration payment until explicit owner approval;
5. after activation, create the app record for `app.yekihast.mobile`, upload the exact vc5 AAB, and complete Console forms from `GOOGLE_PLAY_FINAL_PACKET.md`.

## iOS — parked

Known state:

- EAS project identity/auth passed;
- remote iOS credentials were found;
- production build reached credential setup;
- build stopped because the Distribution Certificate was not validated for non-interactive builds;
- no signed IPA was produced.

Do not resume Apple setup or create replacement credentials without owner direction.

## Source-of-truth map

- `docs/STORE_RELEASE_CURRENT.md` — overall live Store status.
- `docs/GOOGLE_PLAY_FINAL_PACKET.md` — authoritative Android filing packet.
- `docs/GOOGLE_PLAY_ACCOUNT_READINESS.md` — developer-account/organization gate.
- `docs/STORE_SUBMISSION_ANSWERS.md` — compatibility pointer.
- this file — cross-platform handoff/index.

## Do not do

- Do not upload vc2/vc3/vc4 as the final Android release.
- Do not claim current public Internet Voice is operational.
- Do not claim the AAB lacks microphone permission; `RECORD_AUDIO` is present.
- Do not open Caller/voice after filing current audio collection as No without updating Privacy/Data Safety first.
- Do not rebuild Android merely for listing/account/privacy/screenshot changes.
- Do not retry hosted emulator capture workflows.
- Do not replace Android signing credentials.
- Do not rerun Production DB migrations for Store work.
- Do not expose credentials, OTPs or private signing material.
- Do not touch Evidence Axis.
