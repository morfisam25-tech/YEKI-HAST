# Google Play submission packet status

This is a preparation record, not a final or submitted packet. Canonical Console state is in `STORE_RELEASE_CURRENT.md`.

## Identity

- Product: یکی هست
- Android package: `app.yekihast.mobile`
- Next future `versionCode`: greater than 7, target 8+
- AAB uploaded: no

## Console work still required

- create and verify a fresh release binary;
- supply app icon, feature graphic, and phone screenshots;
- complete Data Safety, sign-in details, target audience, and Child Safety declaration;
- configure testers and begin the required testing period only after Owner authorization;
- obtain written Play-policy confirmation for the prepaid wallet/external gateway structure.

The Alpha track currently exists but is inactive, has zero testers, and its 14-day clock has not started. Do not upload old vc7. W33 performs no Play action.

## Voice disclosure candidate — not submitted

The current source declares/uses microphone access for live WebRTC calls. Platform recording is off; TURN may relay encrypted packets; the application server does not terminate/decrypt media; no alternate call-audio upload/storage path was found. A “voice audio not collected as a stored audio file” answer is only a candidate until revalidated against the exact future AAB, dependencies, active provider configuration, and Google Play’s then-current definitions.
