# v1.2 branch status — Internet Voice

Last updated: 2026-09-07

This file tracks branch-only work for `feat/v1-2-internet-voice-foundation`. It does not claim that the branch has been merged or deployed. Production state remains governed by `LAUNCH_STATUS.md` until a guarded release actually occurs.

## Implemented on this branch

- Internet Voice is the primary v1.2 call transport in code; masked PSTN remains optional fallback.
- Transport-neutral call state and server-side Internet Voice signaling are implemented.
- Billing starts only after both participants report media connected.
- 10/30/60 minute call caps, HOLD accounting, +15/+30 extension, 90-second no-answer and server-side lifecycle safeguards are implemented and guarded by tests.
- Web/PWA Caller has a real browser WebRTC flow with microphone permission, signaling, connected-time display, warnings, extension, end and safety exit.
- Android Caller has native Internet Voice support and explicit age / Terms / Safety consent parity.
- Listener profile disclosures distinguish platform-verified fields from self-declared fields on Web and Mobile.
- Public Terms text is aligned with Internet Voice, off-platform contact boundaries and current consent behavior.
- Web Listener work mode now includes presence controls, Caller-gender acceptance, active-call polling, browser WebRTC answer, call heartbeat, safe termination, earnings and recent-call views.
- Web Listener session traffic uses a server-side cookie proxy with explicit endpoint allow-listing and same-origin mutation checks.

## Deliberately fail-closed

- Web Listener does not claim background Push support. When the work tab is hidden or closed, presence is driven Offline on a best-effort fail-closed path so a Caller is not intentionally routed to a browser Listener that cannot receive a real background alert.
- Android background incoming-call notification is not marked ready until a real notification/provider/device-token path exists and is tested on real devices.
- Production TURN/TURNS, production v1.2 schema migration, payment rails and other provider-dependent gates remain closed until their real infrastructure is approved and verified.
- No WebRTC connection is reconstructed or reported as connected merely because the server still has an active call record after a page/app media context is lost.

## QA status

- Foundation tests passed on branch SHA `e53ab5f857537e527141d926020a75bf70bb84f7`.
- That run found one Web target-compatibility issue during workspace typecheck (`BigInt` literal syntax); the code was corrected on the next branch commit.
- A fresh full Foundation QA run is required on the current exact branch HEAD before this work can be considered branch-QA complete.

## Not authorized by this branch work

- No production deployment.
- No production database migration.
- No provider activation or secret change.
- No PR merge.
- No claim that Caller or Listener paid service is publicly launch-ready.
