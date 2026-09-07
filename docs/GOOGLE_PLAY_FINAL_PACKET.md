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
- `RECORD_AUDIO` is requested for v1.2 Internet Voice;
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

## Public Store URLs

- Website: `https://yekihast.app`
- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Support: `sales@uniqueholding.com.tr`

The v1.2 Privacy page is live on production.

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

`وقتی می‌خواهی با یک آدم واقعی حرف بزنی؛ یکی هست برای شنیده‌شدن و همراهی.`

### Full description

`یکی هست` برای زمانی ساخته شده که حضور و گفت‌وگوی انسانی مهم است.

نسخه فعلی مسیر ثبت‌نام و آماده‌سازی شنونده را ارائه می‌کند و زیرساخت تماس صوتی اینترنتی را برای بخش‌های فعال‌شده‌ی محصول دارد. ورود با کد یک‌بارمصرف ایمیلی انجام می‌شود. کاربر می‌تواند پروفایل اولیه را بسازد، زبان‌ها و سطح تسلط خود را مشخص کند و مسیر آموزش و ارزیابی را طی کند.

در بخش تماس صوتی اینترنتی، میکروفون فقط هنگام استفاده از تماس لازم است. رسانه‌ی زنده با WebRTC منتقل می‌شود و اگر اتصال مستقیم ممکن نباشد می‌تواند از TURN عبور کند. برنامه مسیر فعالی برای ضبط یا ذخیره‌ی محتوای صوتی مکالمه ندارد.

حریم خصوصی، قوانین استفاده، پشتیبانی و مسیر حذف حساب در دسترس‌اند. قابلیت‌هایی مثل پرداخت، KYC، تسویه و مسیرهای provider فقط زمانی باید در Store به‌عنوان قابلیت فعال معرفی شوند که production gate واقعی آن‌ها باز و تأیید شده باشد.

`یکی هست` درمان، مشاوره تخصصی یا سرویس اضطراری نیست. اگر در خطر فوری هستید، از خدمات اضطراری محل زندگی خود کمک بگیرید.

## Reviewer access

No hard-coded reviewer password or development OTP is required.

Reviewer path:

1. Launch the app.
2. Use the listener/email sign-in path.
3. Enter an inbox the reviewer can access.
4. Request the one-time email code and enter it in the app.
5. Continue through the available onboarding/training flow.
6. Privacy, Terms, Account Deletion and Support are available from the app surfaces.
7. If the Internet Voice flow is enabled for the reviewer account/environment, microphone permission is requested only for the call path.

Never place OTPs, passwords, session tokens, Expo credentials, signing keys or production secrets in Play Console notes.

## Data Safety filing baseline

Google Play defines data as collected when it is transmitted off-device. Its form also requires data that is processed ephemerally to be represented in the form response, even when that transient processing is not shown as retained collection on the public Data Safety section.

### Data currently used by the signed-in product path

- Email address — authentication, account management, security/support.
- Listener nickname — profile/app functionality.
- Declared gender, languages and proficiency — onboarding/app functionality.
- Optional short introduction — user-provided content.
- Listener training/assessment/application state and answers — app functionality.

### Live Internet Voice

Final vc5 requests `RECORD_AUDIO`.

Current behavior:

- microphone audio is used for a user-initiated live Internet Voice session;
- media is transmitted off-device using WebRTC;
- TURN may relay live media when direct peer connectivity is unavailable;
- conversation audio is not intentionally recorded or persisted by the application;
- transient media should be treated as ephemeral real-time processing when the provider/runtime behavior matches that description.

Conservative Play Console filing baseline for the voice data type:

- Audio files / Voice or sound recordings: **Collected = Yes** for form purposes because live user voice leaves the device;
- Ephemeral processing: **Yes**;
- Purpose: **App functionality**;
- Required vs optional: choose the exact value shown by the Console based on whether the user can use the app without starting a voice call; current product semantics make microphone use call-feature-specific rather than account-wide;
- Shared: **No** only if the final production transfer fits Google's user-initiated-transfer exception for the other participant and any TURN/cloud relay is acting solely as a service provider on the developer's behalf.

Before the final Play submission, confirm the actual production TURN/provider role. If provider behavior or contract does not fit the service-provider/user-initiated exceptions, update the Shared answer instead of guessing.

Do **not** use the old `Microphone: No` / `voice recordings: No` filing baseline.

### Data not currently requested/collected by vc5 through Android permissions

- device location;
- contacts/address book;
- photos/videos;
- SMS/MMS or call logs;
- advertising identifiers for ad targeting;
- broad external/media storage access.

Payment/KYC/payout/provider data must be rechecked if those production gates are opened before Store submission.

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
- Camera: No
- Microphone: **Yes**
- Location: No
- Contacts: No
- SMS/call log/phone: No

The microphone declaration is required by the exact vc5 AAB and must match the live Privacy page.

## Artwork

Ready/locked:

- app/listing icon — 512×512 PNG;
- feature graphic — 1024×500 opaque PNG;
- existing approved icon direction remains closed unless Google Play returns a concrete technical rejection.

## Screenshots

The previous vc3 screenshot kit is superseded as release-equivalence evidence. The final Store binary is vc5.

Hosted GitHub Android emulator capture remains closed because prior Linux KVM and macOS HVF attempts failed before Android booted. Capture final screenshots on a physical Android device from vc5 or a release-equivalent vc5-derived APK.

Recommended real states:

1. Home / product proposition + listener CTA.
2. Listener introduction/onboarding.
3. Email sign-in with no personal email or OTP visible.
4. A real available listener/training or voice-related state that exists in the submitted build.

Never expose real email, OTP, session/admin data or secrets. Do not use speculative payment/KYC/provider screens.

## Content/policy questionnaire baseline

- Not a game.
- No gambling or real-money contest.
- No ads/ad network.
- No government-service claim.
- No VPN service.
- No public social feed.
- The app states it is not treatment, professional counseling or an emergency service.

Answer IARC/content rating and target-audience questions from the exact Play Console form at filing time; do not pre-invent a rating.

## External-only blockers after repository preparation

1. Capture/QC current vc5 screenshots on a real Android device.
2. Confirm/create the Google Play developer account and complete identity/organization verification.
3. Pay any Google developer registration fee only after explicit owner approval.
4. Create the Play app record for `app.yekihast.mobile`.
5. Upload the exact vc5 AAB.
6. Fill Store listing, App access, Data Safety, Content rating, Target audience, Ads and other required declarations from this packet.
7. Confirm final production TURN/provider role before locking the Data Safety Shared answer for live audio.
8. Upload the locked icon/feature graphic and final screenshots.
9. Run Play pre-launch/review checks and fix only evidence-backed findings.
10. Submit to the selected track only after the exact artifact passes the desired review/smoke gate.

## Official Google references checked for this packet

- Data Safety form definitions and ephemeral processing: `https://support.google.com/googleplay/android-developer/answer/10787469`
- User Data policy: `https://support.google.com/googleplay/android-developer/answer/10144311`

## Do not do

- Do not upload vc2/vc3/vc4 as the final Store binary.
- Do not declare Microphone: No for vc5.
- Do not rebuild Android because only Store metadata changed.
- Do not retry hosted Android emulator screenshot runs.
- Do not upload a screenshot-only APK to Google Play.
- Do not replace the Android signing key.
- Do not rerun Production DB migrations for Store work.
- Do not expose credentials, OTPs, private keys or signing material.
- Do not touch Evidence Axis.
- Do not resume Apple/iOS until the owner resumes that phase.
