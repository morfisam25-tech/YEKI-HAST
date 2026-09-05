# یکی هست — Current Store Release Status

Last verified: 2026-09-05

This file is the current Store-release override for older packet sections. Use it together with `STORE_SUBMISSION_ANSWERS.md` and `MOBILE_STORE_RELEASE.md`, but prefer the live values below whenever older files conflict.

## Production runtime already verified

- Repository: `morfisam25-tech/YEKI-HAST`
- Current mobile/artwork `main`: `459559fa9970620ffefa429528ee88c818daa23a`
- Foundation QA on that `main`: Actions run `33941231568` — SUCCESS, including Android export and iOS export.
- Web production release V2: Actions run `33931970953` / run #2 — SUCCESS
- Web production deployment: `dpl_CjotkNAvNfYQq2T7pjZrfa9tCvjF` — READY
- Web production source SHA: `94b6a697a74eda5f70b5cb22a6fa511dc9b2c365`
- Production API remains `https://yeki-hast-unique-6ff0.vercel.app`; no redundant API/Admin/DB release is required for Store preparation.

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

## Expo / EAS access — VERIFIED

Read-only verification run `33941384314` succeeded after installing the `EXPO_TOKEN` repository secret.

Verified facts:

- authenticated Expo identity: `saimorfi`;
- account access: owner of both `saimorfi` and `saimorfis-team`;
- declared project resolves exactly to `@saimorfis-team/yeki-hast`;
- EAS project ID matches `58b9f62d-db82-421a-ad59-edccac70c316`;
- Expo plan: Free;
- current billing period build allowance observed on 2026-09-05: 15 Android + 15 iOS, 0 used before the production Android build;
- estimated overage at verification time: $0.

Do not create a replacement Expo project.

## Production artwork — LOCKED

The final app-icon direction is approved: black/graphite three-dimensional tile with warm gold/ivory opposing conversation bubbles and no text inside the Store icon.

The repository does not commit generated raster binaries. Instead it commits the deterministic generator at `apps/mobile/scripts/generate-artwork.mjs`, which produces:

- `app-icon.png` — 1024x1024, used by iOS and the standard Android icon;
- `android-adaptive-foreground.png` — 1024x1024 transparent adaptive foreground;
- `android-monochrome.png` — 1024x1024 Android themed-icon mark;
- `play-store-icon.png` — 512x512 listing asset.

`apps/mobile/app.json` is wired to those generated outputs. The mobile package runs the generator before Android/iOS exports and through `eas-build-pre-install`, so EAS receives the artwork before native prebuild/signing. A Foundation regression test verifies the PNG signatures/dimensions and config wiring.

The icon-design decision is closed unless a Store platform itself rejects the asset for a concrete technical reason.

## Android signed Store binary — COMPLETE

A real signed Android production Store build completed successfully on EAS.

- EAS build ID: `6881d817-6578-4725-8afd-933b91dd62f8`
- Platform: Android
- Distribution: Store
- Build profile: `production`
- App version: `1.0.0`
- Version code: `2`
- Package: `app.yekihast.mobile`
- Build source commit: `1e9484bc34191bbcbb51bfea9e38934f191fff7d`
- That commit differs from mobile/artwork `main` only by the one-off GitHub workflow used to invoke the build; app/runtime source is the verified `459559fa9970620ffefa429528ee88c818daa23a` baseline.
- EAS used the existing remote Android keystore: `Build Credentials 9ASUP-JZQW (default)`.
- Build completed FINISHED and produced an `.aab` Store archive.

Do not generate or replace the Android signing key unless Google Play or credential evidence later proves it is necessary.

## iOS signed Store binary — BLOCKED ONLY ON APPLE SIGNING SETUP

The production iOS build was attempted from the same verified mobile/artwork baseline using the `production` EAS profile.

Observed result:

- EAS project identity and Expo auth: PASS;
- remote iOS credentials were found on the Expo server;
- remote build number incremented from 1 to 2 during the failed setup attempt;
- EAS stopped before creating an IPA with: `Distribution Certificate is not validated for non-interactive builds` and `Credentials are not set up. Run this command again in interactive mode.`

This is now an external Apple signing-credential setup blocker, not an application-code blocker. The next authorized Apple/EAS interactive credential setup should configure/validate the production Distribution Certificate and distribution Provisioning Profile for bundle ID `app.yekihast.mobile`. After that, rerun the production iOS build; because remote app versioning is enabled, expect the next build number to advance again.

## Remaining blockers

1. Complete the one-time interactive Apple/EAS production signing setup for iOS.
2. Build the signed production iOS IPA after credentials validate.
3. Create/connect the Google Play developer account and app record if not already present.
4. Create/connect the Apple Developer/App Store Connect app record if not already present.
5. Smoke-test the exact signed artifacts on their real distribution paths.
6. Capture release-equivalent screenshots with no real email, OTP, session, admin or secret data.
7. File Google Play Data Safety, Apple App Privacy, age/content rating and final listing metadata from the exact submitted build behavior.
8. Upload the exact tested binaries and submit to the selected testing/public tracks.

## Do not do

- Do not rerun Production DB migrations for Store preparation.
- Do not redeploy API/Admin without a real source/config change requiring it.
- Do not open Caller/payment/KYC/payout/telephony/SMS gates just to satisfy a Store listing.
- Do not place Expo, Apple, Google or signing credentials in source, logs or chat.
- Do not use Evidence Axis resources, projects or secrets for Listener.
