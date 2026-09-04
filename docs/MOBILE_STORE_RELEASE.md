# یکی هست — Mobile Store Release Packet

Last reviewed: 2026-09-03

This packet is the handoff for Android/iOS account setup, signing, signed builds, store metadata, and submission. It intentionally separates source readiness from external developer-account and artwork work.

## Release target

- Product: `یکی هست`
- First store-facing version: `1.0.0`
- Expo slug: `yeki-hast`
- Deep-link scheme: `yekihast`
- Android application ID: `app.yekihast.mobile`
- iOS bundle identifier: `app.yekihast.mobile`
- Orientation: portrait
- iPad/tablet support: not declared for the first iOS release (`supportsTablet: false`)
- Production API target used by EAS profiles: `https://yeki-hast-unique-6ff0.vercel.app`

## Expo / EAS source linkage

The repository declares:

- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Preview profile: internal distribution
- Production profile: production environment with automatic remote build-number/version-code increment
- Production submit profile: present and contains no embedded credential
- Exact build Node: `22.23.1`

The owner/project ID is a source declaration, not proof that the future account session has access to that project. When the Expo account is opened/connected, verify ownership with EAS before creating signing credentials or a production build. Do not create a replacement Expo project unless that check proves the existing linkage is invalid.

## Already ready in the app

- Production API base is explicit in EAS preview/production profiles.
- Email authentication uses the production API.
- Session persistence uses `expo-secure-store`.
- Android application backup is disabled for the app's account/session surface.
- iOS non-exempt encryption declaration is currently `false`, matching the current SecureStore-only app crypto surface.
- Mobile entrypoint uses `RootApp`, which exposes the legal/support footer returned by production bootstrap.
- The app exposes Privacy, Terms, Account Deletion and Support actions.
- The app states that the service is not therapy, professional advice, or emergency service and does not invent a hotline.
- Caller, payment, KYC, payout, telephony and production phone/SMS capabilities remain fail-closed when their production gates are not open.
- Foundation QA exports both Android and iOS JavaScript bundles from committed source.

## Current public support/policy surfaces

Until a custom product domain is connected, the verified public Web surfaces are:

- Website: `https://web-unique-6ff0.vercel.app`
- Privacy: `https://web-unique-6ff0.vercel.app/privacy`
- Terms: `https://web-unique-6ff0.vercel.app/terms`
- Account deletion: `https://web-unique-6ff0.vercel.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

A future custom domain may replace the public-facing URLs after it is connected and independently smoke-tested. Do not break the already-working URLs just to obtain a prettier Store listing URL.

## Current Technical Beta data surface

Store privacy/data-safety declarations must be based on the behavior actually submitted. For the current Email-first Technical Beta, the user-facing source can handle:

- email address for authentication;
- session/authentication state;
- listener nickname;
- declared gender;
- selected languages/proficiency;
- optional listener short introduction;
- listener training/application state.

The closed Technical Beta gates must not be described as active production collection. In particular, identity/KYC, payment/payout, phone verification and telephony data should only be added to Store declarations when those features are genuinely opened in the submitted build/runtime and the corresponding policy review is updated.

## Store listing draft for the current beta scope

These are drafting inputs, not claims that a Store listing already exists.

### App name

`یکی هست`

### Short description

`نسخه آزمایشی پلتفرم گفت‌وگوی انسانی؛ ورود با ایمیل و مسیر ثبت‌نام شنونده.`

### Full description draft

`یکی هست` یک پلتفرم گفت‌وگوی انسانی است. در نسخه فنی فعلی، کاربران می‌توانند با ایمیل وارد شوند و مسیر ثبت‌نام، پروفایل و آموزش شنونده را طی کنند. بخش Caller و قابلیت‌های مالی/تماس فقط زمانی باز می‌شوند که گیت‌های تولیدی مربوط به آن‌ها واقعاً آماده باشند.

این سرویس جایگزین درمان، مشاوره تخصصی یا خدمات اضطراری نیست.

### Review note draft

Current submission scope is an Email-first Technical Beta. Caller voice, payment, KYC, payout, telephony and production phone/SMS flows are intentionally disabled/fail-closed. Reviewers can evaluate the app launch, production bootstrap, Email authentication, session persistence, listener application/training flow, and the in-app Privacy/Terms/Account Deletion/Support links. No reviewer should be instructed to use a mock provider or development OTP.

## External items still required before a signed Store build

These cannot be honestly completed from repository source alone:

1. Verify access to the declared Expo/EAS owner/project.
2. Add approved production app icon/artwork. The repository currently contains no final PNG app-icon/adaptive-icon/splash asset.
3. Create/connect the Google Play developer account.
4. Create/connect the Apple Developer / App Store Connect account.
5. Create or let EAS manage the real Android signing credential.
6. Create or let EAS manage the real Apple signing/distribution credential and provisioning profile.
7. Create a signed Android production build and install/test it on a real Android device.
8. Create a signed iOS production build and test it through the Apple distribution path available to the account.
9. Complete Google Play Data Safety and Apple App Privacy using the actual submitted production behavior.
10. Add screenshots/store artwork and final listing metadata in each Store.
11. Submit to the desired testing/public track and resolve any Store-review findings with evidence, not by weakening runtime safety gates.

## Exact account-day verification sequence

When the accounts are available, use the existing repository linkage first:

1. Authenticate to Expo/EAS and verify the signed-in account.
2. Verify that `saimorfis-team/yeki-hast` resolves to EAS project ID `58b9f62d-db82-421a-ad59-edccac70c316`.
3. Verify Android package and iOS bundle ID are still available/registered as `app.yekihast.mobile` before changing either identifier.
4. Add approved icon/splash artwork and rerun full Foundation QA including both mobile exports.
5. Create a preview/internal Android build first and smoke-test launch, bootstrap, Email OTP, session restore/logout and legal links on a real phone.
6. Create signed production Android/iOS builds from a clean committed release SHA.
7. Record the build IDs, Store version/build numbers and tested SHA in `docs/LAUNCH_STATUS.md`.
8. Only then submit those exact signed artifacts.

## Do not do

- Do not embed Expo, Apple, Google or signing secrets in `app.json`, `eas.json`, source, logs or chat.
- Do not change application IDs casually after Store records are created.
- Do not create a second Expo project merely because account access has not yet been checked.
- Do not claim Caller/payment/KYC/payout/telephony are production-ready while their gates are closed.
- Do not rerun the production DB migration or API deploy just to prepare Store binaries.
