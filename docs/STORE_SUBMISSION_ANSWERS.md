# یکی هست — Store Submission Answers

Last reviewed: 2026-09-04

This is the copy/paste packet for the first Android/iOS Store submission. Re-check every answer against the exact signed build before filing.

## Product identity

- App name: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo slug: `yeki-hast`
- Deep-link scheme: `yekihast`
- Primary language: Persian (`fa`)
- Suggested Store category: `Lifestyle`

Do not change the application IDs after Store records are created unless a proven collision makes it unavoidable.

## Current public URLs

Until the custom domain is connected and smoke-tested, use the verified Vercel URLs:

- Website: `https://web-unique-6ff0.vercel.app`
- Privacy policy: `https://web-unique-6ff0.vercel.app/privacy`
- Account deletion / privacy choices: `https://web-unique-6ff0.vercel.app/account/delete`
- Terms: `https://web-unique-6ff0.vercel.app/terms`
- Support email: `sales@uniqueholding.com.tr`

When `yekihast.app` is connected, replace these only after the same routes pass public smoke checks on the custom domain.

## Google Play listing draft

Google Play currently limits title to 30 characters, short description to 80 characters and full description to 4,000 characters.

### App name

`یکی هست`

### Short description

`برای وقتی که می‌خواهی با یک آدم واقعی حرف بزنی؛ نسخه آزمایشی یکی هست.`

### Full description

`یکی هست` یک پلتفرم گفت‌وگوی انسانی است؛ برای وقتی که می‌خواهی یک آدم واقعی آن طرف مکالمه باشد.

در نسخه فنی فعلی می‌توانی با ایمیل وارد شوی و اگر می‌خواهی شنونده باشی، پروفایل اولیه، زبان‌ها و مسیر آموزش و ارزیابی شنونده را طی کنی.

بخش مکالمه Caller، پرداخت، احراز هویت، تسویه و تماس صوتی هنوز عمومی نشده‌اند و فقط زمانی باز می‌شوند که گیت‌های تولیدی مربوط به آن‌ها واقعاً آماده و تأیید شده باشند.

یکی هست جایگزین درمان، مشاوره تخصصی یا خدمات اضطراری نیست. اگر در خطر فوری هستی از خدمات اضطراری محل زندگی خود کمک بگیر.

حریم خصوصی، قوانین استفاده، حذف حساب و مسیر پشتیبانی از داخل اپ در دسترس‌اند.

### Contact / support

- Support email: `sales@uniqueholding.com.tr`
- Website: current verified Web URL above; replace with the custom domain only after verification.

## Apple App Store listing draft

Apple currently limits app name and subtitle to 30 characters, promotional text to 170 characters, description to 4,000 characters and keywords to 100 bytes.

### Name

`یکی هست`

### Subtitle

`گفت‌وگوی انسانی، وقتی نیاز داری`

### Promotional text

`نسخه فنی یکی هست: ورود امن با ایمیل و مسیر ثبت‌نام و آموزش شنونده، با دسترسی مستقیم به حریم خصوصی، قوانین و حذف حساب.`

### Description

`یکی هست` برای گفت‌وگو با آدم واقعی طراحی شده است.

در نسخه فعلی می‌توانی با ایمیل وارد شوی و مسیر ثبت‌نام، پروفایل، زبان‌ها، آموزش و ارزیابی شنونده را ببینی. قابلیت‌های Caller، تماس صوتی، پرداخت، KYC و تسویه تا عبور از گیت‌های واقعی production عمداً بسته می‌مانند.

حریم خصوصی، قوانین استفاده، حذف حساب و پشتیبانی از داخل اپ در دسترس‌اند.

این سرویس درمان، مشاوره تخصصی یا سرویس اضطراری نیست.

### Keywords draft

`گفتگو,شنونده,صحبت,همراهی,مکالمه,انسانی`

Re-check the App Store Connect byte counter before saving because its 100-byte limit is not the same as 100 Persian characters.

### URLs

- Support URL: current verified Website URL until the custom domain is live.
- Privacy Policy URL: current verified Privacy URL until the custom domain is live.
- User Privacy Choices URL: current verified account-deletion URL.

## Google Play Data Safety — draft for exact current build

This is a filing draft, not a substitute for the Play Console questionnaire. Answer from the exact signed build and active production services.

### Does the app collect user data?

`Yes.`

Current mobile scope has no advertising SDK, analytics SDK, contact-book access, location collection, microphone capture, camera capture or payment SDK. Re-check dependencies before submission.

### Data types currently collected

1. **Personal info — Email address**
   - Collected: Yes
   - Shared for independent advertising/sale: No
   - Purpose: account management, authentication, security, support
   - Required for authenticated use: Yes

2. **Personal info — User-provided profile identifier**
   - Listener nickname; it is not a verified legal name.
   - Collected for listener application flow.
   - Purpose: app functionality / profile.

3. **Personal info — Other profile info**
   - Declared gender
   - Selected languages and proficiency
   - Optional short introduction
   - Listener application/training state
   - Purpose: app functionality / listener onboarding

4. **App/account activity**
   - Authentication/session state and listener workflow state are processed to restore the user journey and secure the account.
   - Re-check the exact Play Console subtype wording at filing time.

### Data not currently collected by the submitted mobile build

Do not declare these as active merely because future schema/code exists:

- precise or approximate device location;
- contacts/address book;
- photos/videos;
- microphone/audio content;
- SMS/call logs;
- payment-card/bank data;
- government ID/KYC documents;
- health data;
- advertising identifiers for ad targeting.

If any of these features are opened before submission, update this packet and Privacy first.

### Data deletion

- In-app path: the persistent mobile footer exposes `حذف حساب` and opens the direct account-deletion resource.
- External web resource: `/account/delete` verifies account ownership by email OTP and requires the explicit phrase `حذف حساب`.
- Active operations admins are blocked from self-service deletion before any destructive or session side effect, so the production owner cannot accidentally lock out operations.
- For a normal account with no retention-protected operational history, the server physically deletes the `app.users` account row. The database cascades account-owned email/phone identities, sessions, listener application/training/assessment, KYC, device/role and related beta rows; identity-linked OTP challenge rows are explicitly removed as well.
- The response reports `deletionCompleted=true` only after physical account deletion succeeds (or the account is already gone).
- If a legitimate retention-sensitive FK exists (for example later financial/call/safety history), the destructive transaction rolls back atomically, sessions remain revoked from the already-committed first phase, and the request stays pending for retention review. The UI does not claim completion in that case.

This provides both the in-app initiation path and the public external deletion resource required for account-creating apps.

## Apple App Privacy — draft for exact current build

App Store Connect requires a privacy policy URL and accurate disclosure of data collected by the app and integrated third-party partners.

### Data linked to the user

Draft disclosure for the current build:

- **Contact Info / Email Address** — authentication, account management, support and security.
- **User Content / Other User Content or Other Data** — optional listener short introduction, if the current App Store Connect subtype applies.
- **Other Data / Profile information** — listener nickname, declared gender, languages/proficiency and application/training state. Map to the closest current App Store Connect types at filing time; do not describe a nickname as verified legal identity.

### Tracking

Draft answer: `No`.

There is currently no advertising or cross-app tracking SDK in the mobile package and no tracking-authorization surface. Re-check the exact signed build before filing.

### Third-party processing

Do not answer from architecture assumptions. At filing time include every active production processor that receives user data for submitted behavior. Gmail authentication-email delivery and production hosting/database are operational processors, not advertising partners; final answers must still match Apple's current questionnaire definitions.

## Account deletion evidence for review

Reviewer path for a normal clean Technical Beta account:

1. Open the app.
2. Scroll to the persistent legal/support footer.
3. Tap `حذف حساب`.
4. The app opens the public account-deletion page.
5. Enter the account email and request the email OTP.
6. Verify the OTP.
7. Type `حذف حساب` and submit.
8. The server revokes sessions and attempts physical deletion immediately.
9. A clean beta account returns completion and the page displays `حساب حذف شد.`
10. Reusing the same email later creates a new account rather than restoring the deleted account.

A retention-protected account receives the pending/review state rather than a false completion message. Do not replace this path with support-only email.

## Store reviewer note

`یکی هست` is being submitted as an Email-first Technical Beta. Reviewers can evaluate app launch, production bootstrap, email authentication, secure session persistence, listener profile/onboarding/training flow, and direct Privacy/Terms/Account Deletion/Support links. Caller voice, payment, KYC, payout, telephony and production phone/SMS flows are intentionally disabled/fail-closed in this build. No mock provider or development OTP is required or offered.

If review requires an inbox-accessible test account, create a dedicated reviewer account only through the approved Store-account workflow; never put an OTP, password, private key or production secret in source or public listing metadata.

## Screenshot capture plan

Use real in-app screens only; do not submit speculative future Caller/payment screens.

Capture at least four portrait states on a clean test account:

1. Home — brand, human-listening proposition and listener CTA.
2. Email authentication — real login surface, with no live OTP visible.
3. Listener profile — nickname/gender/language selection using safe dummy data.
4. Listener training/application — a real current training/onboarding state.

Optional fifth screenshot:

5. Legal/support footer — Privacy, Terms, Account Deletion and Support visible.

Google Play currently requires at least two screenshots and recommends at least four 1080px+ portrait screenshots for recommendation surfaces. Apple accepts one to ten screenshots and requires valid device-size screenshots. Never expose a real user email, OTP, session identifier, admin data or secret.

## Artwork still required

The source still lacks final approved production raster artwork. Before signed builds:

- approved square launcher source, ideally 1024x1024 PNG;
- Google Play listing icon, 512x512 PNG;
- Android adaptive foreground/background artwork if needed;
- iOS app icon generated into the native asset catalog through the Expo build pipeline;
- screenshot framing/copy only after raw release-equivalent screenshots exist.

Do not ship a random placeholder icon merely to satisfy a build.

## Submission-day blockers only

After source prep, remaining external blockers are:

1. Custom domain purchase/connection if it will be used in Store metadata on day one.
2. Approved final icon/artwork.
3. Expo/EAS account access verification for the declared project.
4. Google Play developer account and app record.
5. Apple Developer/App Store Connect account and app record.
6. Real Android and Apple signing credentials.
7. Signed production builds from an exact clean SHA.
8. Real-device smoke test of those exact signed builds.
9. Final Data Safety/App Privacy/age-rating questionnaires in the Store consoles.
10. Screenshots, metadata and exact tested binaries uploaded and submitted.

No production DB migration or provider-gate opening is required merely to create the first Store records or signed beta binaries. Production API/Web deployment is required whenever this Store-readiness source differs from the live production SHA.

## Official requirement references

- Google Play store listing fields and limits: https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play preview asset requirements: https://support.google.com/googleplay/android-developer/answer/9866151
- Google Play user data/account deletion policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play account deletion guidance: https://support.google.com/googleplay/android-developer/answer/13327111
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App privacy reference: https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy
- Apple screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Apple platform version metadata reference: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
