# یکی هست — Current Store Release Status

Last verified: 2026-09-05

This file is the current Store-release override for older packet sections. Use it together with `STORE_SUBMISSION_ANSWERS.md` and `MOBILE_STORE_RELEASE.md`, but prefer the live values below whenever older files conflict.

## Production runtime already verified

- Repository: `morfisam25-tech/YEKI-HAST`
- Web production release V2: Actions run `33931970953` / run #2 — SUCCESS
- Web production deployment: `dpl_CjotkNAvNfYQq2T7pjZrfa9tCvjF` — READY
- Web production source SHA: `94b6a697a74eda5f70b5cb22a6fa511dc9b2c365`
- Production API remains `https://yeki-hast-unique-6ff0.vercel.app`; no redundant API/Admin/DB release is required for Store artwork preparation.

## Public Store URLs — use these now

- Website: `https://yekihast.app`
- Privacy policy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion / privacy choices: `https://yekihast.app/account/delete`
- Support email: `sales@uniqueholding.com.tr`

Verified redirect policy:

- `https://www.yekihast.app` -> `https://yekihast.app` with HTTP 308
- `https://yeki-hast.com` -> `https://yekihast.app` with HTTP 308
- `https://www.yeki-hast.com` -> `https://yekihast.app` with HTTP 308

The primary domain returned HTTP 200 for `/`, `/privacy`, `/terms`, and `/account/delete` after production promotion.

## Account deletion status

The current production deletion path is real and Store-usable:

- clean account -> physical deletion
- retention-sensitive account -> `202 review_required`
- active operations admin -> `409` before destructive side effects
- reviewer-facing page: `https://yekihast.app/account/delete`

Do not describe the current implementation as support-only or deletion-request-only.

## Mobile identity

- App name: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Expo SDK baseline: `~57.0.9`
- Android API target baseline: 36
- iOS/Xcode baseline: 26

Android and iOS source exports pass Foundation QA. This is not evidence of signed Store binaries.

## Production artwork — LOCKED

The final app-icon direction is approved: black/graphite three-dimensional tile with warm gold/ivory opposing conversation bubbles and no text inside the Store icon.

The repository does not commit generated raster binaries. Instead it commits the deterministic generator at `apps/mobile/scripts/generate-artwork.mjs`, which produces:

- `app-icon.png` — 1024x1024, used by iOS and the standard Android icon;
- `android-adaptive-foreground.png` — 1024x1024 transparent adaptive foreground;
- `android-monochrome.png` — 1024x1024 Android themed-icon mark;
- `play-store-icon.png` — 512x512 listing asset.

`apps/mobile/app.json` is wired to those generated outputs. The mobile package runs the generator before Android/iOS exports and through `eas-build-pre-install`, so EAS receives the artwork before native prebuild/signing. A Foundation regression test verifies the PNG signatures/dimensions and config wiring.

The icon-design decision is closed unless a Store platform itself rejects the asset for a concrete technical reason.

## Remaining blockers before signed binaries

1. Verify authenticated access to the declared Expo/EAS project; do not create a replacement project unless the existing linkage is proven invalid.
2. Create/connect the Google Play developer account and app record.
3. Create/connect the Apple Developer/App Store Connect account and app record.
4. Create or let EAS manage the real Android signing credential.
5. Create or let EAS manage the real Apple distribution/signing credential and provisioning profile.
6. Build signed Android AAB and iOS IPA from an exact clean release SHA.
7. Smoke-test the exact signed artifacts on the real distribution paths.
8. Capture release-equivalent screenshots with no real email, OTP, session, admin or secret data.
9. File Google Play Data Safety, Apple App Privacy, age/content rating and final listing metadata from the exact submitted build behavior.
10. Upload the exact tested binaries and submit to the selected testing/public tracks.

## Do not do

- Do not rerun Production DB migrations for Store preparation.
- Do not redeploy API/Admin without a real source/config change requiring it.
- Do not open Caller/payment/KYC/payout/telephony/SMS gates just to satisfy a Store listing.
- Do not place Expo, Apple, Google or signing credentials in source, logs or chat.
- Do not use Evidence Axis resources, projects or secrets for Listener.
