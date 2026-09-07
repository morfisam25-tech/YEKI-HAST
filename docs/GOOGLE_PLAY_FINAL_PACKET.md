# یکی هست — Google Play Final Packet

Last verified: 2026-09-07

Android-first release packet. Apple/iOS remains out of scope until the owner resumes Apple setup.

## Release identity

- App: `یکی هست`
- Package: `app.yekihast.mobile`
- Version: `1.0.0`
- Final Android versionCode: `5`
- Expo owner: `saimorfis-team`
- EAS project ID: `58b9f62d-db82-421a-ad59-edccac70c316`
- EAS build ID: `51dc645a-b56f-4428-91b5-73337898f870`
- Build source commit: `c2e2918c9ae171bf03f9b603f5bc665d00f3db0f`
- Distribution: `STORE`
- Build profile: `production`
- Target SDK: Android 16 / API 36
- Final AAB SHA-256: `f843909c6a239d784f38c97c304310a64a7e4ab5c59410cd905de8b89bd06e32`
- Signing: existing EAS-managed `Build Credentials 9ASUP-JZQW (default)`; do not replace it.

## Exact AAB verification

Verified against the exact vc5 AAB:

- archive integrity passed;
- `jarsigner` verification passed;
- package is `app.yekihast.mobile`;
- app version is `1.0.0` / versionCode `5`;
- targetSdkVersion is `36`;
- `RECORD_AUDIO` is present for the implemented Internet Voice capability;
- camera is not requested;
- location is not requested;
- contacts are not requested;
- SMS/call-log/phone permissions are not requested;
- advertising ID is not requested;
- overlay and external-storage/media-read permissions are not requested.

Requested permission list from the exact vc5 manifest:

- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.BLUETOOTH`
- `android.permission.INTERNET`
- `android.permission.MODIFY_AUDIO_SETTINGS`
- `android.permission.RECORD_AUDIO`
- `android.permission.USE_BIOMETRIC`
- `android.permission.USE_FINGERPRINT`
- `android.permission.VIBRATE`
- `android.permission.WAKE_LOCK`
- app-scoped `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

### DUMP false-positive correction

`android.permission.DUMP` appears in the merged manifest only as `android:permission` protecting AndroidX ProfileInstaller's receiver. It is **not** a `<uses-permission>` requested by the app. The first verifier incorrectly scanned every permission string in the manifest. Forensic run `34156081233` confirmed the exact vc5 requested-permission surface and the corrected audit passed.

## Final AAB archive

- archive/verification run: `34156200702` — SUCCESS
- artifact: `yeki-hast-final-android-aab-v1.0.0-vc5-v1.2`
- artifact ID: `10031041956`
- artifact digest: `sha256:eb6026c5d6a0827cb0881e8ff0048e041be4aaf0e88a1ba271c8bd3bcb831d2a`
- expiry: `2026-12-06`

The artifact contains the exact AAB, checksum, dumped manifest and requested-permission list. Upload the `.aab`, not the outer GitHub artifact ZIP.

## Current production gate truth — VERIFIED

The final binary contains Internet Voice implementation, but the submitted public production environment does **not** currently expose an operational Caller/voice path.

Safe production audits on 2026-09-07 confirmed:

- TURN/provider audit run `34161228428` — SUCCESS;
- Caller gate audit run `34161306558` — SUCCESS;
- `CALLER_CLOSED_BETA_ENABLED=false`;
- `COMMERCIAL_HOSTING_APPROVED=false`;
- `INTERNET_VOICE_ICE_SERVERS_JSON` absent;
- Iran TURN and domestic control-plane values absent;
- payment/KYC/payout providers not configured;
- production bootstrap returns `features.callerClosedBetaEnabled=false`.

The app shell reads that server gate and routes users to the non-operational Caller information/waitlist state instead of opening a call.

This distinction is mandatory for Store filing: **permission present in the APK is not the same thing as data actually collected by the current public production behavior.**

## Public Store URLs

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

The privacy page must describe the closed Caller/voice production state before final Play submission.

## Google Play record values

- App or game: App
- App name: `یکی هست`
- Default language: Persian / Farsi (`fa`)
- Suggested category: Lifestyle
- Contains ads: No
- Package: `app.yekihast.mobile`

Do not invent the legal developer/Seller name. It must match the actual Google Play developer account identity.

## Main listing copy

### App name

`یکی هست`

### Short description

`مسیر ثبت‌نام، آموزش و آماده‌سازی شنونده برای تجربه انسانی «یکی هست».`

### Full description

`یکی هست` برای ساختن یک تجربه انسانیِ شنیده‌شدن طراحی شده است.

نسخه عمومی فعلی روی مسیر شنونده تمرکز دارد: ورود با کد یک‌بارمصرف ایمیلی، ساخت پروفایل اولیه، انتخاب زبان‌ها و سطح تسلط، آموزش و ارزیابی، دسترسی به قوانین و حریم خصوصی، پشتیبانی و حذف حساب.

زیرساخت Caller و تماس صوتی اینترنتی در محصول پیاده‌سازی شده، اما گیت آن در production فعلی باز نیست و نباید در این انتشار به‌عنوان قابلیت عمومی فعال معرفی شود. پرداخت، KYC بیرونی، تسویه و مسیرهای provider نیز تا زمانی که گیت production واقعی آن‌ها باز و تأیید نشده باشد عمومی نیستند.

`یکی هست` درمان، مشاوره تخصصی یا سرویس اضطراری نیست. اگر در خطر فوری هستید، از خدمات اضطراری محل زندگی خود کمک بگیرید.

## Reviewer access

No hard-coded reviewer password or development OTP is required.

Reviewer path:

1. Launch the app.
2. Use the listener/email sign-in path.
3. Enter an inbox the reviewer can access.
4. Request the one-time email code and enter it in the app.
5. Continue through the available listener onboarding/training flow.
6. Privacy, Terms, Account Deletion and Support are available from the app surfaces.
7. Caller/Internet Voice is intentionally closed in the submitted production environment; do not provide or promise a reviewer-only bypass.

Never place OTPs, passwords, session tokens, Expo credentials, signing keys or production secrets in Play Console notes.

## Data Safety filing baseline — CURRENT PRODUCTION

Google Play separates the manifest permission list from the Data Safety section. The permission list describes permissions declared by the APK; Data Safety describes data the app actually collects/shares. Google's current guidance also states that data transmitted off-device must generally be represented as collection, while permission presence by itself does not mean the data is collected.

### Data currently used by the signed-in listener path

At filing time, map the exact Play Console data-type labels to the current behavior. The current application path processes at least:

- Email address — authentication, account management and security/support.
- Listener nickname — profile/app functionality.
- Declared gender, languages and proficiency — onboarding/app functionality.
- Optional short introduction — user-provided content/app functionality.
- Listener training/assessment/application state and answers — app functionality.

These current account/profile data types must be disclosed accurately in the form. Do not infer `Shared = Yes` merely because first-party hosting/database/email service providers process data on the developer's behalf; apply Google's service-provider rules to the exact Console questions.

### Audio / Voice or sound recordings

Final vc5 declares `RECORD_AUDIO`, but production Caller/Internet Voice is closed and no TURN relay is configured.

Current filing baseline for **Audio files / Voice or sound recordings**:

- Collected: **No** for this submitted production state;
- Shared: **No** for this submitted production state;
- Reason: the public production gate prevents users from entering an operational voice session, so conversation audio is not transmitted by the current public behavior;
- this does **not** change the manifest/permission fact that `RECORD_AUDIO` exists in vc5.

Before `CALLER_CLOSED_BETA_ENABLED` or any equivalent public Caller/voice gate is opened in production:

1. configure and verify the actual TURN/provider path;
2. verify whether live media is direct, relayed, end-to-end encrypted, or readable by any intermediary;
3. re-evaluate Google Play Data Safety collection/sharing/ephemeral/service-provider answers;
4. update Privacy and Store disclosures **before** enabling the feature;
5. do not rely on this current `Audio = No` filing after voice becomes operational.

The implemented application backend has no conversation-audio recording/storage path, but that fact alone would not make future live off-device voice transmission `Collected = No`; future filing must follow the then-active runtime behavior and Google's current definitions.

### Data not currently requested/collected through Android permission-dependent public paths

- device location;
- contacts/address book;
- photos/videos;
- SMS/MMS or call logs;
- advertising identifiers for ad targeting;
- broad external/media storage access;
- conversation voice/audio in the current closed Caller environment.

Payment/KYC/payout/provider data must be rechecked if those production gates are opened before or after Store submission.

### Security/deletion baseline

- production traffic uses secure transport;
- account creation exists;
- account deletion is available in-app and through the public deletion page;
- clean account -> physical deletion;
- retention-sensitive account -> review/retention state;
- active operations admin -> deletion blocked before destructive side effects.

## Permission / ads baseline

- Contains ads: No
- Advertising ID: No
- Camera permission: No
- Microphone permission: **Yes** (`RECORD_AUDIO` exists in vc5)
- Current production audio collection: **No** while Caller/voice remains closed
- Location permission: No
- Contacts permission: No
- SMS/call log/phone permission: No

Do not answer a permission question with the Data Safety collection answer or vice versa.

## Artwork

Ready/locked:

- app/listing icon — 512×512 PNG;
- feature graphic — 1024×500 opaque PNG;
- existing approved icon direction remains closed unless Google Play returns a concrete technical rejection.

## Screenshots

The previous vc3 screenshot kit is superseded as release-equivalence evidence. The final Store binary is vc5.

Hosted GitHub Android emulator capture remains closed because prior Linux KVM and macOS HVF attempts failed before Android booted. Capture final screenshots on a physical Android device from vc5 or a release-equivalent vc5-derived APK.

Recommended real states:

1. Home / current proposition with Caller visibly closed if that state is shown.
2. Listener introduction/onboarding.
3. Email sign-in with no personal email or OTP visible.
4. A real listener profile/training/assessment state that exists in the submitted build.

Never expose real email, OTP, session/admin data or secrets. Do not fabricate Caller/payment/KYC/provider screens.

## Content/policy questionnaire baseline

- Not a game.
- No gambling or real-money contest.
- No ads/ad network.
- No government-service claim.
- No VPN service.
- No public social feed.
- The app states it is not treatment, professional counseling or an emergency service.

Answer IARC/content rating and target-audience questions from the exact Play Console form at filing time; do not pre-invent a rating.

## External-only blockers after repository/privacy reconciliation

1. Capture/QC current vc5 screenshots on a real Android device.
2. Confirm/create the Google Play developer account and complete identity/organization verification.
3. Pay any Google developer registration fee only after explicit owner approval.
4. Create the Play app record for `app.yekihast.mobile`.
5. Upload the exact vc5 AAB.
6. Fill Store listing, App access, Data Safety, Content rating, Target audience, Ads and other required declarations from this packet.
7. Upload the locked icon/feature graphic and final screenshots.
8. Run Play pre-launch/review checks and fix only evidence-backed findings.
9. Submit to the selected track only after the exact artifact passes the desired review/smoke gate.

TURN/provider verification is **not** a blocker for this release while Caller/voice remains closed. It becomes a mandatory pre-enable gate before Internet Voice is made operational later.

## Official Google references checked for this packet

- Data Safety form definitions, permission-vs-collection distinction and ephemeral processing: `https://support.google.com/googleplay/android-developer/answer/10787469`
- User Data policy: `https://support.google.com/googleplay/android-developer/answer/10144311`

## Do not do

- Do not upload vc2/vc3/vc4 as the final Store binary.
- Do not claim the current public release has operational Internet Voice.
- Do not claim the vc5 APK lacks microphone permission; it contains `RECORD_AUDIO`.
- Do not file current conversation audio as collected while the production Caller/voice path remains closed.
- Do not open Caller/voice after filing `Audio = No` without first updating Data Safety and Privacy.
- Do not rebuild Android because only Store metadata/privacy wording changed.
- Do not retry hosted Android emulator screenshot runs.
- Do not upload a screenshot-only APK to Google Play.
- Do not replace the Android signing key.
- Do not rerun Production DB migrations for Store work.
- Do not expose credentials, OTPs, private keys or signing material.
- Do not touch Evidence Axis.
- Do not resume Apple/iOS until the owner resumes that phase.
