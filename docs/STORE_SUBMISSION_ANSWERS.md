# یکی هست — Store Submission Answers

Last reconciled: 2026-09-05

> This file is now a compatibility/index document. Do not use older values from its Git history. For Android, the authoritative filing source is `GOOGLE_PLAY_FINAL_PACKET.md`. For overall current status, use `STORE_RELEASE_CURRENT.md`.

## Current product identity

- App: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Primary language: Persian (`fa`)
- Suggested Store category: `Lifestyle`

## Current public URLs — use these

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

Do not fall back to the old `web-unique-6ff0.vercel.app` URLs in Store metadata.

## Android — authoritative current state

Use `docs/GOOGLE_PLAY_FINAL_PACKET.md` for all copy/paste Android filing answers and `docs/GOOGLE_PLAY_ACCOUNT_READINESS.md` for developer-account setup.

Locked Android release facts:

- final signed Store AAB: `1.0.0`, versionCode `3`;
- package: `app.yekihast.mobile`;
- target SDK: Android 16 / API 36;
- final AAB SHA-256: `8cbf19c57352ad8aa2a8d08c01e48e7d9f76581f3d05c36e99264a4df8d43cd3`;
- existing EAS-managed Android signing key retained;
- Store-risk permissions removed before the final build;
- icon/listing artwork and 1024×500 feature graphic are ready;
- physical-device screenshot kit is ready from the exact final AAB.

The older versionCode `2` Android build is superseded. Do not upload it.

Do not rebuild Android merely because Store copy, account setup, screenshots, or listing graphics change.

## Android reviewer/Data Safety baseline

The current submitted Technical Beta is email-first and listener-focused.

Current active user-facing data includes:

- email address for authentication/account management/security/support;
- listener nickname;
- declared gender;
- languages/proficiency;
- optional short introduction;
- listener application/training/assessment workflow state and answers.

Current release does not actively expose/collect through the mobile app:

- device location;
- contacts/address book;
- photos/videos;
- microphone/voice recordings;
- SMS/MMS or call logs;
- advertising identifiers for ad targeting;
- payment-card data;
- active Caller conversation content.

Caller voice, payment, KYC, payout, telephony and production phone/SMS remain disabled/fail-closed and must not be represented as active Store features.

Account deletion is real and Store-usable:

- clean account -> physical deletion;
- retention-sensitive account -> review/retention state;
- active operations admin -> blocked before destructive side effects;
- public deletion resource -> `https://yekihast.app/account/delete`.

## Android screenshots

Do not retry GitHub-hosted Android emulator capture for this release. Both Linux KVM and macOS HVF paths failed at hosted-virtualization level before the app could run.

Use the prepared physical-device screenshot kit from Actions run `33948412172`.

Recommended real states:

1. Home / brand proposition + listener CTA.
2. Listener introduction.
3. Email sign-in with no personal email or OTP visible.
4. Listener profile/training after a safe test login, or the real Caller-closed informational screen if stronger.

Never expose a real email, OTP, session/admin data or secret.

## Google Play developer-account gate

Before signup, the owner must confirm the exact legal publishing entity. For a genuine business publisher, Google directs use of an Organization developer account and requires matching organization/D-U-N-S/payments-profile evidence.

No registration payment is authorized by this file. The current Google one-time developer registration fee is documented in `GOOGLE_PLAY_ACCOUNT_READINESS.md`; stop before payment until explicit owner approval.

## Apple / iOS — parked, not deleted

The iOS source/export baseline remains intact, but Android-first release work is intentionally active while Apple is parked.

Known iOS production blocker remains external Apple signing setup:

- EAS found remote iOS credentials;
- non-interactive production build stopped because the Distribution Certificate was not yet validated for non-interactive use;
- one-time interactive Apple/EAS production certificate/provisioning validation is required before rerunning the signed iOS build.

Do not create replacement Apple credentials, enroll/pay for Apple Developer membership, or resume iOS production work without explicit owner direction.

The old Apple listing/privacy drafts in this file's Git history are not authoritative for submission day. Recheck Apple forms and the exact successful IPA when Apple work resumes.

## Current source-of-truth order

1. `docs/STORE_RELEASE_CURRENT.md` — live overall Store status.
2. `docs/GOOGLE_PLAY_FINAL_PACKET.md` — final Android filing packet.
3. `docs/GOOGLE_PLAY_ACCOUNT_READINESS.md` — Google Play account/organization gate.
4. `docs/MOBILE_STORE_RELEASE.md` — platform handoff/index.
5. This file — compatibility pointer only.

## Do not do

- Do not use stale Vercel Store URLs.
- Do not use Android versionCode `2`.
- Do not claim final artwork is still missing.
- Do not claim Expo/EAS access is still unverified.
- Do not rebuild Android without an actual binary/runtime reason.
- Do not retry hosted Android emulator screenshot workflows.
- Do not upload the screenshot-only APK to Google Play.
- Do not rerun Production DB migrations.
- Do not redeploy API/Admin without a real runtime/config reason.
- Do not open Caller/payment/KYC/payout/telephony/SMS gates for Store cosmetics.
- Do not put credentials, OTPs, private keys or tokens in source, logs or chat.
- Do not touch Evidence Axis.
