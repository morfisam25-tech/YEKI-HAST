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
- Platform recording (W58, source-only — see docs/W58_RECORDING_CORE_FOUNDATION.md): **On at public launch**, locked product policy. Both participants are informed before media connects. Audio files are collected/shared with: no one outside the platform (not sold, not shared with advertisers, not used for AI training, no public playback, no user download). Purpose: app functionality (safety/complaint investigation, enforcement review) only. Data is encrypted in transit and access is limited to authorized safety-admin review of a linked case; retention has a configurable operational default and users can request deletion via the existing account-deletion flow subject to the same open-case/legal-hold exceptions as other account data. Internal technical Preview may still have recording explicitly disabled pre-W54/W60.
- TURN: may relay encrypted WebRTC packets and observe technical connection metadata.
- Application-server media termination/decryption: recording-required calls only, via the Cloudflare RealtimeKit server-side recording path (W58); the live P2P WebRTC media path itself is unchanged pending the separate W54/W60 mobile signaling migration.
- Alternate call-audio upload/storage: **not found** (no client-side or independent-participant upload path; platform recording is server-side only).

Any Data Safety selection must be checked against the exact future AAB, active runtime, dependencies, providers, and current Play definitions before submission. No answer in this file has been filed.

## Public URLs in source

- Privacy: `https://yekihast.app/privacy`
- Terms: `https://yekihast.app/terms`
- Account deletion: `https://yekihast.app/account/delete`
- Child Safety: `https://yekihast.app/safety/children`

The account-deletion route and bootstrap URL exist in source. This document does not assert that a specific Console requirement has been completed or accepted.

## Outstanding Play policy gate

Written confirmation is still required for the prepaid wallet/external payment-gateway structure. The underlying live one-to-one human-listening service (platform-recorded for safety per W58, not unrecorded) is not currently treated as a proven Play Billing blocker.

See `GOOGLE_PLAY_FINAL_PACKET.md` and canonical `STORE_RELEASE_CURRENT.md`.
