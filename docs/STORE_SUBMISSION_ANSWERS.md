# یکی هست — Store Submission Answers

Last reconciled: 2026-09-07

This file is a compatibility/index document. Do not use older values from its Git history. For Android, the authoritative filing source is `GOOGLE_PLAY_FINAL_PACKET.md`. For overall current status, use `STORE_RELEASE_CURRENT.md`.

## Current product identity

- App: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Primary language: Persian (`fa`)
- Suggested Store category: `Lifestyle`

## Current public URLs

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

Do not use old Vercel Store URLs in metadata.

## Android — authoritative current state

Use `docs/GOOGLE_PLAY_FINAL_PACKET.md` for all Android filing answers and `docs/GOOGLE_PLAY_ACCOUNT_READINESS.md` for developer-account setup.

Locked final Android binary facts:

- app version: `1.0.0`;
- final versionCode: `5`;
- package: `app.yekihast.mobile`;
- target SDK: Android 16 / API 36;
- EAS build ID: `51dc645a-b56f-4428-91b5-73337898f870`;
- source commit: `c2e2918c9ae171bf03f9b603f5bc665d00f3db0f`;
- final AAB SHA-256: `f843909c6a239d784f38c97c304310a64a7e4ab5c59410cd905de8b89bd06e32`;
- existing EAS-managed signing key retained;
- archive verification run: `34156200702` — SUCCESS;
- archive artifact ID: `10031041956`.

vc2/vc3/vc4 are superseded. Do not upload them.

## Production gate truth

Safe production audits `34161228428` and `34161306558` confirmed:

- Caller closed beta is disabled;
- commercial hosting approval gate is false;
- no TURN/ICE relay is configured;
- no Iran TURN/domestic voice control plane is configured;
- production bootstrap reports `callerClosedBetaEnabled=false`.

Internet Voice therefore exists in the vc5 implementation but is not an operational public feature of the submitted production environment.

## Android permission / Data Safety baseline

Final vc5 exact requested permissions include `RECORD_AUDIO`; camera is not requested.

Permission/manifest answers:

- Microphone permission: **Yes**
- Camera permission: No
- Location permission: No
- Contacts permission: No
- SMS/call-log/phone permission: No
- Advertising ID: No
- Ads: No

Current production Data Safety audio answers while the Caller/voice gate remains closed:

- Audio files / Voice or sound recordings — Collected: **No**
- Audio files / Voice or sound recordings — Shared: **No**

Permission presence is not the same as collection. Before Caller/Internet Voice is enabled later, Privacy and Data Safety must be rechecked and updated against the actual then-active provider/runtime first.

The application has no implemented conversation-audio recording/storage path. The `android.permission.DUMP` string in the merged manifest belongs to AndroidX ProfileInstaller receiver protection and is not an app-requested `<uses-permission>`.

## Account deletion

- clean account -> physical deletion;
- retention-sensitive account -> review/retention state;
- active operations admin -> blocked before destructive side effects;
- public deletion resource -> `https://yekihast.app/account/delete`.

## Android screenshots

The old vc3 screenshot kit is superseded. Use vc5 physical-device screenshot artifact `10031149382` and capture only real current states; do not fabricate active Caller/voice/payment/KYC screens.

Do not retry the prior GitHub-hosted Android emulator paths; Linux KVM and macOS HVF both failed before Android booted.

## Google Play developer-account gate

Before signup, the owner must confirm the exact legal publishing entity. For a genuine business publisher, use the Organization path with matching D-U-N-S/payments-profile/company evidence.

No registration payment is authorized by this file. Stop before payment until explicit owner approval.

## Apple / iOS — parked

iOS source/export remains parked. Known external blocker: one-time interactive Apple/EAS Distribution Certificate and provisioning-profile validation. Do not create replacement Apple credentials or resume iOS work without owner direction.

## Current source-of-truth order

1. `docs/STORE_RELEASE_CURRENT.md`
2. `docs/GOOGLE_PLAY_FINAL_PACKET.md`
3. `docs/GOOGLE_PLAY_ACCOUNT_READINESS.md`
4. `docs/MOBILE_STORE_RELEASE.md`
5. This file

## Do not do

- Do not use vc2/vc3/vc4.
- Do not claim the current public production release has operational Internet Voice.
- Do not claim vc5 lacks microphone permission.
- Do not open Caller/voice after filing current audio collection as No without updating Privacy/Data Safety first.
- Do not rebuild Android merely because Store copy/account/screenshots change.
- Do not retry hosted Android emulator screenshot workflows.
- Do not rerun Production DB migrations.
- Do not replace Android signing credentials.
- Do not expose secrets, OTPs or private signing material.
- Do not touch Evidence Axis.
