# یکی هست — Google Play Submission Packet

Last verified: 2026-09-05

This is the Android-first filing packet for the first Google Play submission. Apple/iOS is intentionally out of scope here.

## 1. Exact Android release artifact

Use this binary only unless a later Android runtime change forces a rebuild.

- App: `یکی هست`
- Package name: `app.yekihast.mobile`
- App version: `1.0.0`
- Version code: `2`
- EAS project: `@saimorfis-team/yeki-hast`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- EAS production build ID: `6881d817-6578-4725-8afd-933b91dd62f8`
- Distribution: `STORE`
- Build profile: `production`
- Signing: existing EAS-managed Android keystore `Build Credentials 9ASUP-JZQW (default)`
- AAB source commit: `1e9484bc34191bbcbb51bfea9e38934f191fff7d`
- App/runtime baseline behind that build: `459559fa9970620ffefa429528ee88c818daa23a`
- AAB SHA-256: `1dadfc076951ca6496a94358551de384c728a4a6a83e64247070a87d0e41e6bc`

Artifact QA evidence:

- EAS build status: `FINISHED`
- archive type: `.aab`
- ZIP integrity: PASS
- base manifest present: PASS
- JAR signature verification: PASS (`jar verified`)
- artifact QA run: GitHub Actions `33945488990`

Do not replace the Android keystore. Do not rebuild merely to change Store text or Store graphics.

## 2. Google Play application record

Recommended account type for a commercial/business publisher: `Organization`.

Values that are already fixed:

- App or game: `App`
- App name: `یکی هست`
- Default language: Persian / Farsi (`fa`)
- Package: `app.yekihast.mobile`
- Suggested category: `Lifestyle`
- Contains ads: `No`
- Website: `https://yekihast.app`
- Support email: `sales@uniqueholding.com.tr`
- Privacy policy: `https://yekihast.app/privacy`
- Account deletion URL: `https://yekihast.app/account/delete`
- Terms: `https://yekihast.app/terms`

The developer/Seller name must match the actual Play developer account decision. Do not invent a legal entity name in the listing.

## 3. Main Store listing — ready copy

### App name

`یکی هست`

### Short description

`وقتی می‌خواهی با یک آدم واقعی حرف بزنی؛ یکی هست برای شنیده‌شدن و همراهی.`

This is 72 characters and remains under Google's current 80-character limit.

### Full description

`یکی هست` برای زمانی ساخته شده که حضور و گفت‌وگوی انسانی مهم است.

نسخه فعلی روی مسیر شنونده تمرکز دارد. کاربر می‌تواند با ایمیل وارد شود، پروفایل اولیه شنونده را بسازد، زبان‌ها و سطح تسلط خود را انتخاب کند و مسیر آموزش و ارزیابی را طی کند.

ورود با کد یک‌بارمصرف ایمیلی انجام می‌شود و نشست ورود به‌صورت امن نگهداری می‌شود. حریم خصوصی، قوانین استفاده، پشتیبانی و مسیر حذف حساب از داخل اپ در دسترس‌اند.

قابلیت‌های Caller، تماس صوتی، پرداخت، KYC و تسویه فقط زمانی عمومی می‌شوند که provider و کنترل‌های production مربوط واقعاً آماده و تأیید شده باشند. نسخه‌ای که برای این انتشار ثبت می‌شود نباید قابلیت بسته را به‌عنوان قابلیت فعال معرفی کند.

`یکی هست` درمان، مشاوره تخصصی یا سرویس اضطراری نیست. اگر در خطر فوری هستید، از خدمات اضطراری محل زندگی خود کمک بگیرید.

حریم خصوصی: `https://yekihast.app/privacy`

حذف حساب: `https://yekihast.app/account/delete`

پشتیبانی: `sales@uniqueholding.com.tr`

## 4. App access / reviewer instructions

No hard-coded reviewer password or development OTP is required.

Reviewer instructions:

1. Launch `یکی هست`.
2. Choose email sign-in.
3. Enter an email inbox the reviewer can access.
4. Request the one-time email code.
5. Enter the received OTP in the app.
6. A new clean account can proceed through the listener profile/onboarding/training path.
7. Privacy, Terms, Account Deletion, and Support are available from the persistent footer.

Do not put an OTP, password, session token, Expo token, signing key, or production secret in Play Console reviewer notes.

## 5. Data Safety — exact current Android behavior draft

This section is the filing map for the current signed Technical Beta. Re-check it immediately before pressing Submit in Play Console if production gates have changed.

### Does the app collect user data?

`Yes`

Google defines collection as data transmitted off the device, including data sent through bundled SDKs.

### Data collected

#### Personal info — Email address

- Collected: `Yes`
- Required: `Yes` for authenticated use
- Purpose: Account management; App functionality; Security / fraud prevention; Support
- Shared for advertising or sale: `No`

#### Personal info — Name

The listener `nickname` fits Google's Name category because the category includes nicknames.

- Collected: `Yes` when a listener application is created
- Required: `Yes` for that listener application path
- Purpose: App functionality / profile
- Shared for advertising or sale: `No`

#### Personal info — Other info

Current listener application includes declared gender plus selected languages/proficiency.

- Collected: `Yes`
- Purpose: App functionality / listener onboarding
- Shared for advertising or sale: `No`

#### App activity — Other actions

The backend receives and stores listener workflow actions such as training module completion and assessment state/answers.

- Collected: `Yes`
- Purpose: App functionality
- Shared for advertising or sale: `No`

#### Other user-generated content

Optional listener short introduction and open-ended assessment answers are user-provided content.

- Collected: `Yes` when supplied
- Optional where applicable: `Yes`
- Purpose: App functionality / listener application and assessment
- Shared for advertising or sale: `No`

### Data not collected by the current public submitted behavior

Do not declare these as active merely because future or fail-closed code paths exist:

- precise or approximate device location;
- address book / contacts;
- photos or videos;
- microphone / voice recordings / audio content;
- SMS or MMS content;
- device call logs;
- advertising identifiers for ad targeting;
- health or fitness data;
- payment-card data;
- current Caller conversation content.

### KYC / bank data gate

The binary contains a future listener KYC surface, but the production policy is fail-closed and the current public release does not describe KYC as an active capability. The POST endpoint requires production KYC security configuration and otherwise returns `kyc_not_configured`.

Before Google Play submission, preserve that closed state. If KYC is opened or made reachable for the distributed build, update Data Safety and Privacy before submission to include the actual identity/financial data transmitted (for example legal name, date of birth, government/national identifier, IBAN/bank details) using the exact Play Console categories then presented.

### Sharing

Draft answer for the current release: no independent sale, advertising sharing, or cross-company data use. Operational infrastructure/email providers act only to provide the service. Apply Google's current service-provider exception wording in the final form rather than guessing from architecture labels.

### Security practices

- Data encrypted in transit: `Yes` — production app/API traffic uses HTTPS.
- Account creation: `Yes`.
- Account deletion available: `Yes`.
- In-app route: persistent `حذف حساب` footer link.
- External deletion resource: `https://yekihast.app/account/delete`.
- Clean account: physical deletion.
- Retention-sensitive account: review/retention state instead of a false completion claim.

## 6. Privacy / deletion policy gate — PASS

Current public privacy resource:

`https://yekihast.app/privacy`

It identifies `یکی هست`, describes current email/session/listener data, distinguishes closed future features, explains retention/deletion, and exposes the support contact.

Current external deletion resource:

`https://yekihast.app/account/delete`

The mobile app also exposes Privacy, Terms, Account Deletion, and Support from its persistent footer.

## 7. Ads / SDK / sensitive-permission audit — current build

Current mobile runtime dependencies are limited to Expo/React Native, `expo-secure-store`, and status-bar support. No Firebase Analytics, Google Mobile Ads/AdMob, Meta SDK, Sentry, Segment, Mixpanel, camera, location, contacts, or microphone package is declared in the mobile package.

Current filing answer:

- Contains ads: `No`
- Advertising ID used for targeting: `No`
- Location permission: `No`
- Contacts permission: `No`
- Camera permission: `No`
- Microphone permission: `No` for the submitted closed-caller release

Re-audit if dependencies or feature gates change before upload.

## 8. Content / policy questionnaire draft

Use the actual Play Console questions, but this is the current evidence baseline:

- App is not a game.
- No gambling feature.
- No real-money game/contest.
- No ad network.
- No health/medical service claim.
- No government-service claim.
- No VPN service.
- No active financial-product service in this submitted beta.
- Caller voice/chat is closed in the submitted release.
- No public social feed.
- No public user-to-user messaging surface in the submitted release.
- App explicitly states it is not treatment, professional counseling, or an emergency service.

For the IARC age/content questionnaire, answer only the exact generated questions; do not preselect a rating in source documentation.

## 9. Target Android version gate

Google Play requires new phone/tablet apps submitted after 2026-08-31 to target Android 16 / API 36 or higher.

Repository baseline is API 36. The exact signed AAB must also pass the bundle-manifest target-SDK check before upload. Do not request an extension unless exact artifact evidence unexpectedly proves the target lower than 36.

## 10. Required Store graphics

Already locked:

- launcher/app icon source direction;
- generated Google Play listing icon: 512x512 PNG.

Still needs release-equivalent output before final Play submission:

- feature graphic: exactly 1024x500 JPEG or 24-bit PNG without alpha;
- at least four strong portrait screenshots at 1080x1920 or higher for recommendation-quality coverage.

Screenshots must show the actual app experience. Do not fabricate Caller/payment/KYC screens that are not active in the submitted release, and never expose a real email, OTP, session ID, admin data, or secret.

Recommended four actual states:

1. Home / brand proposition + listener CTA.
2. Email sign-in surface with no real email or OTP visible.
3. Listener profile setup using safe dummy content.
4. Listener training/onboarding state using safe dummy content.

Optional fifth: legal/support footer.

## 11. Google Play Console actions that cannot be completed from the repo

These are external account/console actions, not code blockers:

1. Create/verify the Google Play full-distribution developer account if one does not already exist.
2. For an Organization account, provide the actual legal organization identity, D-U-N-S number, website, phone/contact details, payments profile, and verification documents requested by Google.
3. Pay Google's developer registration fee only with explicit owner approval; do not infer approval from this packet.
4. Create the Play app record for package `app.yekihast.mobile`.
5. Upload the exact AAB identified in section 1.
6. Fill Store listing, App access, Data Safety, Content rating, Target audience, Ads, and other required policy declarations using this packet as the evidence baseline.
7. Upload the exact approved Store graphics/screenshots.
8. Run Google Play pre-launch/review checks and fix only evidence-backed findings.
9. Submit first to the selected testing/public track, then promote only after the exact uploaded artifact passes the desired smoke/review gate.

## 12. Do not do

- Do not touch Apple/iOS while Android-first release is being completed.
- Do not rerun Production DB migrations.
- Do not redeploy API/Admin without an actual runtime/config change requiring it.
- Do not open Caller/payment/KYC/payout/telephony/SMS gates merely to make the Store listing look fuller.
- Do not replace the Android signing key.
- Do not upload a new AAB if only Store metadata/graphics change.
- Do not put secrets or OTPs in Play Console metadata or GitHub source.

## Official references checked for this packet

- Target API requirements: https://support.google.com/googleplay/android-developer/answer/11926878
- Create/set up app and listing limits: https://support.google.com/googleplay/android-developer/answer/9859152
- Preview asset requirements: https://support.google.com/googleplay/android-developer/answer/9866151
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- User Data / privacy / account deletion: https://support.google.com/googleplay/android-developer/answer/10144311
- Developer account type: https://support.google.com/googleplay/android-developer/answer/13634885
- Developer account required information: https://support.google.com/googleplay/android-developer/answer/13628312
