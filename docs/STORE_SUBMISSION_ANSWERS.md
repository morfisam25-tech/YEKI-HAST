# Store submission answers — unsubmitted draft

These are source-backed preparation notes only. Data Safety, sign-in details, target audience, and Child Safety declaration are not started in Google Play Console.

## Product boundary

«یکی هست» is an 18+ marketplace for live one-to-one voice calls between Persian-speaking Callers and real human Listeners. It is not therapy, psychiatric/psychological treatment, medical care, dating, escort, or an emergency service.

## Android identity

- Package: `app.yekihast.mobile`
- Existing Console app: Draft
- Current uploaded AAB: none
- Next future `versionCode`: greater than 7, target 8+
- Old vc7: must not be uploaded

## Permissions and voice behavior

- Microphone permission: **Yes**, for live WebRTC voice.
- Camera permission: **No** for the call flow.
- Platform recording: **Off**.
- TURN: may relay encrypted WebRTC packets and observe technical connection metadata.
- Application-server media termination/decryption: **not implemented**.
- Alternate call-audio upload/storage: **not found**.

Any Data Safety selection must be checked against the exact future AAB, active runtime, dependencies, providers, and current Play definitions before submission. No answer in this file has been filed.

## Public URLs in source

- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Child Safety: `https://yekihast.app/safety/children`

The account-deletion route and bootstrap URL exist in source. This document does not assert that a specific Console requirement has been completed or accepted.

## Outstanding Play policy gate

Written confirmation is still required for the prepaid wallet/external payment-gateway structure. The underlying live one-to-one unrecorded human service is not currently treated as a proven Play Billing blocker.

See `GOOGLE_PLAY_FINAL_PACKET.md` and canonical `STORE_RELEASE_CURRENT.md`.
