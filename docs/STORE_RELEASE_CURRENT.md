# Store release — current verified state

Last source update: 2026-09-13 (W33, based on the W32 Console audit)

This file is the repository source of truth for the current Google Play state. It does not authorize a build, upload, tester change, submission, or Production change.

## Google Play Console

- App record: exists as **Draft**.
- Package: `app.yekihast.mobile`.
- Uploaded AAB: **none**.
- Closed testing / Alpha: exists, **Inactive**.
- Configured testers: **zero**.
- 14-day testing clock: **not started**.
- Data Safety: **not started**.
- Sign-in details: **not started**.
- Target audience: **not started**.
- Child safety declaration: **not started**.
- Store text: exists.
- App icon, feature graphic, and phone screenshots in Console: **missing**.
- Phone/contact verification: **complete**.

## Binary rule

The old vc7 binary must not be uploaded. The next future Android build must use a fresh `versionCode` greater than 7; target **8 or higher**. W33 does not create or upload an AAB.

## Policy gates

- The live one-to-one, unrecorded human listening service is not currently treated as a proven Play Billing blocker.
- The prepaid wallet and external payment-gateway design still requires written Google Play policy confirmation before release.
- Console declarations must be completed against the exact future binary and active runtime. No repository draft is a submitted declaration.
- The source exposes an account-deletion route and bootstrap URL. Whether a particular Console requirement is satisfied has not been independently established here.

## Voice/Data Safety source finding

Current source uses peer WebRTC media, permits TURN to relay encrypted packets, has platform recording off, and contains no application-server media termination or alternate call-audio upload/storage route. The exact future binary, dependencies, provider configuration, and active runtime must be re-audited before filing Data Safety.
