# یکی هست — Current Store Release Status

Last verified: 2026-09-05

This file is the current Store-release override for older packet sections that still mention the pre-domain Vercel Web URL. Use this file together with `STORE_SUBMISSION_ANSWERS.md` and `MOBILE_STORE_RELEASE.md`, but prefer the live values below whenever those older files conflict.

## Exact release source

- Repository: `morfisam25-tech/YEKI-HAST`
- Current verified `main`: `94b6a697a74eda5f70b5cb22a6fa511dc9b2c365`
- Foundation QA on this `main`: Actions run `33930845617` — SUCCESS
- Web production release V2: Actions run `33931970953` / run #2 — SUCCESS
- Web deployment: `dpl_CjotkNAvNfYQq2T7pjZrfa9tCvjF` — READY
- Web deployment source SHA: `94b6a697a74eda5f70b5cb22a6fa511dc9b2c365`

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

## API status relevant to Store submission

Production API remains `https://yeki-hast-unique-6ff0.vercel.app`.

Verified live on 2026-09-05:

- `/health`: HTTP 200
- `/ready`: HTTP 200
- `/v1/bootstrap`: HTTP 200
- Current API release SHA reported by `/health`: `005809afa503803e5c3405e42d1de73b63931479`

No API source change was required for the Web-domain release, so no redundant API redeploy was performed.

## Account deletion status

The current production deletion path is real and Store-usable:

- clean account -> physical deletion
- retention-sensitive account -> `202 review_required`
- active operations admin -> `409` before destructive side effects
- reviewer-facing page: `https://yekihast.app/account/delete`

Do not describe the current implementation as a support-only deletion request or as deletion-request-only. Older launch notes that still say final deletion is blocked are stale.

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

## Remaining blockers before signed binaries

These require external account/credential access or approved visual assets:

1. Approve and commit final production icon/artwork.
2. Verify authenticated access to the declared Expo/EAS project; do not create a replacement project unless the existing linkage is proven invalid.
3. Create/connect the Google Play developer account and app record.
4. Create/connect the Apple Developer/App Store Connect account and app record.
5. Create or let EAS manage the real Android signing credential.
6. Create or let EAS manage the real Apple distribution/signing credential and provisioning profile.
7. Build signed Android AAB and iOS IPA from an exact clean release SHA.
8. Smoke-test the exact signed artifacts on the real distribution paths.
9. Capture release-equivalent screenshots with no real email, OTP, session, admin or secret data.
10. File Google Play Data Safety, Apple App Privacy, age/content rating and final listing metadata from the exact submitted build behavior.
11. Upload the exact tested binaries and submit to the selected testing/public tracks.

## Do not do

- Do not rerun Production DB migrations for Store preparation.
- Do not redeploy API/Admin without a real source/config change requiring it.
- Do not open Caller/payment/KYC/payout/telephony/SMS gates just to satisfy a Store listing.
- Do not place Expo, Apple, Google or signing credentials in source, logs or chat.
- Do not use Evidence Axis resources, projects or secrets for Listener.
