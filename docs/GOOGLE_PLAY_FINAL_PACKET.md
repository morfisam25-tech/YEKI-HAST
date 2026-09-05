# یکی هست — Google Play Final Packet

Last verified: 2026-09-05

Android-first release packet. Apple/iOS is intentionally out of scope until the owner resumes Apple setup.

## Release identity

- App: `یکی هست`
- Package: `app.yekihast.mobile`
- Version: `1.0.0`
- Final Android versionCode: `3`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- Production build workflow: GitHub Actions run `33946371769` — SUCCESS
- Build source commit: `cee6d1f545e166ff27b8b71e5c7f422af9e7cb1a`
- Runtime/config parent: `501c5227ea288a451301f5ce7e81ae7b652539f6`
- Final AAB SHA-256: `8cbf19c57352ad8aa2a8d08c01e48e7d9f76581f3d05c36e99264a4df8d43cd3`
- Distribution: Store
- Build profile: `production`
- Signing: existing EAS-managed Android keystore; do not replace it.

## Final AAB verification

Verified against the exact final AAB, not just repository config:

- `.aab` archive exists and is downloadable from the completed EAS build.
- SHA-256 matches the locked value above.
- package is `app.yekihast.mobile`.
- app version is `1.0.0` / versionCode `3`.
- targetSdkVersion is Android 16 / API 36.
- AAB signature/archive checks passed.
- unused Store-risk permissions were removed before this build: `SYSTEM_ALERT_WINDOW`, legacy external-storage permissions, and app-requested `DUMP`.
- current submitted permission surface does not request camera, microphone, location, contacts, SMS/call-log, or advertising-ID access.

## Public Store URLs

Use these values:

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

The primary domain and the privacy/terms/deletion routes were already production-smoke-tested. Do not fall back to the older Vercel URLs in Store metadata.

## Google Play record values

- App or game: App
- App name: `یکی هست`
- Default language: Persian / Farsi (`fa`)
- Suggested category: Lifestyle
- Contains ads: No
- Package: `app.yekihast.mobile`
- Website/support/privacy/deletion: use the URLs above.

Do not invent the legal developer/Seller name. It must match the actual Google Play developer account identity.

## Main listing copy

### App name

`یکی هست`

### Short description

`وقتی می‌خواهی با یک آدم واقعی حرف بزنی؛ یکی هست برای شنیده‌شدن و همراهی.`

### Full description

`یکی هست` برای زمانی ساخته شده که حضور و گفت‌وگوی انسانی مهم است.

نسخه فعلی روی مسیر شنونده تمرکز دارد. کاربر می‌تواند با ایمیل وارد شود، پروفایل اولیه شنونده را بسازد، زبان‌ها و سطح تسلط خود را انتخاب کند و مسیر آموزش و ارزیابی را طی کند.

ورود با کد یک‌بارمصرف ایمیلی انجام می‌شود و نشست ورود به‌صورت امن نگهداری می‌شود. حریم خصوصی، قوانین استفاده، پشتیبانی و مسیر حذف حساب از داخل اپ در دسترس‌اند.

قابلیت‌های Caller، تماس صوتی، پرداخت، KYC و تسویه فقط زمانی عمومی می‌شوند که provider و کنترل‌های production مربوط واقعاً آماده و تأیید شده باشند. در این انتشار نباید این قابلیت‌های بسته به‌عنوان قابلیت فعال معرفی شوند.

`یکی هست` درمان، مشاوره تخصصی یا سرویس اضطراری نیست. اگر در خطر فوری هستید، از خدمات اضطراری محل زندگی خود کمک بگیرید.

## Reviewer access

No hard-coded reviewer password or development OTP is required.

Reviewer path:

1. Launch the app.
2. Choose the listener flow and email sign-in.
3. Enter an inbox the reviewer can access.
4. Request the one-time email code and enter it in the app.
5. A clean account can continue through listener onboarding/training.
6. Privacy, Terms, Account Deletion and Support are available from the app footer.

Never place OTPs, passwords, session tokens, Expo credentials, signing keys or production secrets in Play Console notes.

## Data Safety filing baseline

Current release collects/transmits data needed for the signed-in listener path:

- email address — required for authentication/account management/security/support;
- listener nickname — profile/app functionality;
- declared gender, languages and proficiency — listener onboarding/app functionality;
- optional short introduction — user-provided content;
- listener training/assessment/application workflow state and answers — app functionality.

Current release does not actively collect through the mobile app:

- device location;
- contacts/address book;
- photos/videos;
- microphone or voice recordings;
- SMS/MMS or call logs;
- advertising identifiers for ad targeting;
- health/fitness data;
- payment-card data;
- active Caller conversation content.

KYC/payment/caller/provider paths remain fail-closed. If any of those gates are opened before submission, stop and re-file Data Safety/Privacy from the changed production behavior.

Security/deletion baseline:

- production traffic uses HTTPS;
- account creation exists;
- account deletion is available both from the app path and the public deletion page;
- clean account -> physical deletion;
- retention-sensitive account -> review/retention state, not a false completion claim;
- active operations admin -> deletion blocked before destructive side effects.

## SDK / ads / permission baseline

Current mobile dependency surface is Expo/React Native plus SecureStore/status-bar support. There is no declared Firebase Analytics, Google Mobile Ads/AdMob, Meta SDK, Sentry, Segment, Mixpanel, camera, location, contacts or microphone package in the mobile workspace.

Filing baseline:

- Contains ads: No
- Tracking/ad targeting: No
- Camera: No
- Microphone: No
- Location: No
- Contacts: No

## Artwork

Ready/locked:

- app/listing icon — 512×512 PNG generated from the approved icon direction;
- feature graphic — 1024×500 opaque PNG, generated and QC'd;
- icon direction is closed unless Google Play itself returns a concrete technical rejection.

## Screenshot package and capture policy

GitHub-hosted Android emulators are not a valid path for this release environment:

- Linux exact-AAB capture run `33947024183` failed because usable KVM acceleration was unavailable;
- macOS ARM64 exact-AAB capture run `33947827376` failed with `HVF error: HV_UNSUPPORTED` before Android could boot.

These are hosted virtualization failures, not app failures. Do not retry that infrastructure path.

A physical-device screenshot kit was successfully generated from the exact final versionCode 3 AAB:

- kit run: `33948412172` — SUCCESS;
- artifact: `yeki-hast-android-screenshot-kit-v1.0.0-vc3`;
- artifact ID: `9964042649`;
- artifact digest: `sha256:3053fa2d2f8d8555d8cb79799d20cd10d67d82af17897736999799bc3eada4e3`;
- expiry: 2026-12-04.

The kit includes an installable APK derived from the exact Store AAB, Windows ADB helpers, checksums, and safety instructions. The APK is re-signed with a disposable screenshot-only key. It is only for visual capture and MUST NOT be uploaded to Google Play.

Capture on a real Android phone at 1080×1920 or higher. Recommended real states:

1. Home / brand proposition + listener CTA.
2. Listener introduction.
3. Email sign-in with no personal email or OTP visible.
4. Caller-closed informational screen; after a safe test login, a listener profile/training screen can replace it if visually stronger.

Do not substitute speculative Caller/payment/KYC screens and never expose real email, OTP, session/admin data or secrets.

## Content/policy questionnaire baseline

- Not a game.
- No gambling or real-money contest.
- No ads/ad network.
- No government-service claim.
- No VPN service.
- No active financial-product service in this submitted release.
- Caller voice/chat is closed.
- No public social feed.
- No public user-to-user messaging surface in the submitted release.
- The app states it is not treatment, professional counseling or an emergency service.

For IARC/content rating and target-audience questions, answer the exact Play Console questionnaire shown at filing time; do not pre-invent a rating.

## External-only blockers after repository preparation

These are not app-code blockers:

1. Capture/QC the final physical-device screenshots using the prepared kit.
2. Confirm/create the Google Play developer account and complete identity/organization verification.
3. Pay any Google developer registration fee only after explicit owner approval.
4. Create the Play app record for package `app.yekihast.mobile`.
5. Upload this exact final versionCode 3 AAB.
6. Fill Store listing, App access, Data Safety, Content rating, Target audience, Ads and other required declarations from this packet.
7. Upload the locked icon/feature graphic and final physical-device screenshots.
8. Run Play pre-launch/review checks and fix only evidence-backed findings.
9. Submit to the chosen testing/public track only after the exact artifact passes the desired smoke gate.

## Do not do

- Do not rebuild Android because only listing text/graphics changed.
- Do not retry hosted Android emulator screenshot runs for this release.
- Do not upload the screenshot-only APK to Google Play.
- Do not replace the Android signing key.
- Do not reopen Caller/payment/KYC/payout/telephony/SMS gates for Store cosmetics.
- Do not rerun Production DB migrations.
- Do not redeploy API/Admin without an actual runtime/config reason.
- Do not touch Evidence Axis.
- Do not touch Apple/iOS while Android-first release is being closed.
