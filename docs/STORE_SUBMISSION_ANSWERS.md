# یکی هست — Store Submission Answers

Last reviewed: 2026-09-04

This file is the copy/paste packet for the first Android/iOS Store submission. It is based on the committed Email-first Technical Beta behavior and must be re-checked against the exact signed build before submission.

## Product identity

- App name: `یکی هست`
- Version: `1.0.0`
- Android package: `app.yekihast.mobile`
- iOS bundle ID: `app.yekihast.mobile`
- Expo slug: `yeki-hast`
- Deep-link scheme: `yekihast`
- Primary language for first submission: Persian (`fa`)
- Suggested Store category: `Lifestyle`

Do not change the application IDs after Store records are created unless there is a proven collision that cannot be resolved.

## Current public URLs

Until the custom domain is connected and smoke-tested, use the already verified public URLs:

- Website: `https://web-unique-6ff0.vercel.app`
- Privacy policy: `https://web-unique-6ff0.vercel.app/privacy`
- Account deletion / privacy choices: `https://web-unique-6ff0.vercel.app/account/delete`
- Terms: `https://web-unique-6ff0.vercel.app/terms`
- Support email: `sales@uniqueholding.com.tr`

When `yekihast.app` is connected, update these fields only after the custom-domain routes pass the same public smoke checks.

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
- Website: current verified Web URL above; replace with custom domain only after verification.

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

Re-check the byte counter in App Store Connect before saving because the 100-byte limit is not the same as a 100-character limit for non-ASCII text.

### Support URL

Use the current verified Website URL until the custom domain is live.

### Privacy Policy URL

Use the current verified Privacy URL until the custom domain is live.

### User Privacy Choices URL

Use the current verified account-deletion URL.

## Google Play Data Safety — draft for exact current build

This section is a filing draft, not a substitute for the Play Console questionnaire. Answer from the exact signed build and all active production services.

### Does the app collect or share required user data?

`Yes, the app collects user data.`

Current submitted scope has no advertising SDK, analytics SDK, contact-book access, location collection, microphone capture, camera capture or payment SDK in the mobile package. Re-check dependencies before submission.

### Data types currently collected

1. **Personal info — Email address**
   - Collected: Yes
   - Shared with third parties for independent advertising/sale: No
   - Purpose: account management, authentication, security, support
   - Required for authenticated use: Yes

2. **Personal info — Name / user-provided profile identifier**
   - Current field is a listener nickname, not a verified legal name.
   - Collected: Yes for listener application path
   - Purpose: app functionality / profile

3. **Personal info — Other info**
   - Declared gender
   - Selected languages and proficiency
   - Optional short introduction
   - Listener application/training state
   - Purpose: app functionality / listener onboarding

4. **App activity / account state**
   - Authentication/session state and listener workflow status are processed to restore the user journey and secure the account.
   - Re-check the exact Play Console category wording at filing time before mapping these server-side records to a Data Safety subtype.

### Data not currently collected by the submitted mobile build

Do not declare these as active current collection merely because future code/schema exists:

- precise or approximate device location;
- contacts/address book;
- photos/videos;
- microphone/audio content;
- SMS/call logs;
- payment-card/bank data;
- government ID/KYC documents;
- health data;
- advertising identifiers for ad targeting.

If any of these features are opened before submission, this packet and the privacy policy must be updated first.

### Data deletion

- In-app path: the mobile footer exposes `حذف حساب` and opens the direct account deletion resource.
- External web resource: `/account/delete` allows the account owner to verify the account email by OTP and initiate an authenticated deletion request.
- A deletion request revokes active sessions immediately; final deletion/anonymization remains subject to documented retention requirements for records that must legitimately be retained.

Google Play requires both an in-app path and an external web resource for apps that allow account creation. The current source provides both initiation paths.

## Apple App Privacy — draft for exact current build

App Store Connect requires a privacy policy URL and an accurate disclosure of data collected by the app and integrated third-party partners.

### Data linked to the user

Draft disclosure for the current build:

- **Contact Info / Email Address** — authentication, account management, support and security.
- **User Content / Other User Content or Other Data** — user-provided listener short introduction, if App Store Connect presents the applicable subtype.
- **Other Data / Profile information** — listener nickname, declared gender, languages/proficiency and application/training state. Map to the closest current App Store Connect data types at filing time; do not misclassify a nickname as a verified legal identity.

### Tracking

Draft answer: `No`.

There is currently no advertising or cross-app tracking SDK in the mobile package and the current app does not request a tracking authorization surface. Re-check the exact signed build before filing.

### Third-party sharing

Do not answer from architecture assumptions. At filing time include every active production processor whose code/service receives user data for the submitted behavior. Gmail delivery of authentication email and production hosting/database are operational processors, not advertising partners; the final App Privacy answers must still reflect the exact data handling required by Apple's questionnaire.

## Account deletion evidence for review

The app supports account creation/authentication by email. The source therefore intentionally provides a visible account deletion path.

Reviewer path:

1. Open the app.
2. Scroll to the persistent legal/support footer.
3. Tap `حذف حساب`.
4. The app opens the public account deletion page.
5. Enter the account email and request the email OTP.
6. Verify the OTP.
7. Type `حذف حساب` and submit.
8. The server records the deletion request and revokes active sessions.

Do not tell a Store reviewer that deletion is instantaneous if retained records still require review. Do not replace this path with a support-only email.

## Store reviewer note

`یکی هست` is being submitted as an Email-first Technical Beta. Reviewers can evaluate app launch, production bootstrap, email authentication, secure session persistence, listener profile/onboarding/training flow, and direct Privacy/Terms/Account Deletion/Support links. Caller voice, payment, KYC, payout, telephony and production phone/SMS flows are intentionally disabled/fail-closed in this build. No mock provider or development OTP is required or offered.

If the review account requires access to an email inbox for OTP, create a dedicated reviewer test account only through an approved Store-account workflow; never put an OTP, password, private key or production secret in source or public listing metadata.

## Screenshot capture plan

Screenshots must show actual in-app experience; do not submit speculative future Caller/payment screens.

Capture at least these four portrait states on a clean test account:

1. Home — brand, human-listening proposition and listener CTA.
2. Email authentication — the real email login surface with no live OTP exposed in the screenshot.
3. Listener profile — nickname/gender/language selection with safe dummy data.
4. Listener training/application — an actual current training/onboarding screen.

Optional fifth screenshot:

5. Legal/support footer — Privacy, Terms, Account Deletion and Support visible.

Google Play currently requires at least two screenshots and recommends at least four 1080px+ portrait screenshots for app recommendation surfaces. Apple accepts one to ten screenshots and requires valid device-size screenshots; for an iPhone-only first release, capture the highest accepted iPhone size available in the Store tooling and let App Store Connect scale when allowed.

Never capture real user email, OTP, session identifiers, admin data or production secrets in Store screenshots.

## Artwork still required

The source still lacks final approved production raster artwork. Before signed builds:

- Android/Expo launcher source: approved square PNG, ideally 1024x1024 source quality.
- Google Play listing icon: 512x512 PNG per Play requirements.
- Android adaptive foreground/background artwork if the chosen icon needs adaptive treatment.
- iOS app icon generated into the native asset catalog through the Expo build pipeline.
- Screenshot frames/background copy only after raw screenshots are captured from the signed or release-equivalent build.

Do not add a random placeholder icon merely to satisfy a build. First Store binaries should carry the approved brand asset.

## Submission-day blockers only

After this packet, the remaining non-source blockers are deliberately narrow:

1. Custom domain purchase and connection, if the custom domain is to be used in Store metadata on day one.
2. Approved final icon/artwork.
3. Expo/EAS account access verification for the declared project.
4. Google Play developer account and app record.
5. Apple Developer/App Store Connect account and app record.
6. Real Android and Apple signing credentials.
7. Signed production builds from an exact clean SHA.
8. Real-device smoke test of those exact signed builds.
9. Final Data Safety/App Privacy/age-rating questionnaire completion in the Store consoles.
10. Upload screenshots, metadata and exact tested binaries, then submit.

No production DB migration, API redeploy or provider-gate opening is required merely to create the first Store records or signed beta binaries.

## Official requirement references used for this packet

- Google Play store listing fields and limits: https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play preview asset requirements: https://support.google.com/googleplay/android-developer/answer/9866151
- Google Play user data/account deletion policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play account deletion guidance: https://support.google.com/googleplay/android-developer/answer/13327111
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App privacy reference: https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy
- Apple screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Apple platform version metadata reference: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
