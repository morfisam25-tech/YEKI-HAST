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
- Web Listener work mode includes presence controls, Caller-gender acceptance, active-call polling, browser WebRTC answer, call heartbeat, safe termination, earnings and recent-call views.
- Web Listener session traffic uses a server-side cookie proxy with explicit endpoint allow-listing and same-origin mutation checks.
- Web Listener onboarding now covers application/profile creation, four training modules, assessment submission, real server-reviewed assessment status, KYC entry and handoff to work mode.
- Listener assessment submission is serialized per application and refuses a second pending attempt while a prior assessment is awaiting review.
- A genuinely failed assessment can be retried; post-onboarding states such as agreement, admin review, suspension, rejection and archive remain read-only until the server explicitly returns the application to an editable stage.
- Web and Mobile now follow the same fail-closed post-onboarding state policy instead of replaying training for locked application states.
- KYC submission authenticates before provider-readiness disclosure, still validates the real provider before reading or storing sensitive identity payloads, and refuses to overwrite an existing pending review.
- Manual admin KYC reject/expire actions are limited to pending evidence and cannot create a verified identity.

## Deliberately fail-closed

- Web Listener does not claim background Push support. When the work tab is hidden or closed, presence is driven Offline on a best-effort fail-closed path so a Caller is not intentionally routed to a browser Listener that cannot receive a real background alert.
- Android background incoming-call notification is not marked ready until a real notification/provider/device-token path exists and is tested on real devices.
- Production TURN/TURNS, production v1.2 schema migration, payment rails, KYC provider activation and other provider-dependent gates remain closed until their real infrastructure is approved and verified.
- No KYC result is synthesized from UI state or manual admin review. Verification remains a provider-dependent gate.
- No WebRTC connection is reconstructed or reported as connected merely because the server still has an active call record after a page/app media context is lost.

## QA status

- Full Foundation QA succeeded on branch SHA `7a8f2d8a93de7d04936787979d82da8177232644`: Foundation tests, invariants/security verification, workspace typecheck, Web/Admin production builds, Android prebuild/export, iOS export and API bundle all passed.
- Subsequent focused regression guards passed for Listener assessment state hardening and Listener KYC/Mobile post-onboarding state hardening.
- Bot-authored patch commits caused GitHub pull-request workflow runs to stop at `action_required` before jobs were created; those are not test failures.
- A fresh full Foundation QA run is required on the current exact branch HEAD after the latest Listener state changes before this branch is branch-QA complete.

## Not authorized by this branch work

- No production deployment.
- No production database migration.
- No provider activation or secret change.
- No PR merge.
- No claim that Caller or Listener paid service is publicly launch-ready.
