# Listener APP / «یکی هست» — Launch Readiness

Last reviewed: 2026-09-06
Blueprint authority: v1.2, 6 September 2026

This document defines the stable launch gates. Live state, current HEAD, run IDs, infrastructure findings and the exact remaining blockers are maintained in [`LAUNCH_STATUS.md`](./LAUNCH_STATUS.md). If live-state wording here ever becomes stale, verify the repository and production systems before acting.

## Non-negotiable production rules

- Production Vercel team: `UNIQUE` only.
- No database migration, reset or role creation without explicit approval.
- No invented call-provider semantics, fake WebRTC success or fake production OTP behavior.
- Production remains fail-closed when a dependency required by the opened scope is unavailable.
- A missing masked-PSTN provider is **not** a v1.2 launch blocker; masked PSTN is fallback only.
- Secrets, bank details, private identity data, OTPs and session material must never be committed or printed.
- Caller remains closed until the v1.2 paid-launch gate is genuinely ready.
- A build, Vercel `READY` state or `/health` 200 alone is not evidence that the application is launch-ready.

## Release integrity gate

A production release requires all of the following:

1. A real committed root `package-lock.json` generated from the supported release toolchain.
2. Clean `npm ci --ignore-scripts --no-audit --no-fund` validation of that lock.
3. A real Foundation QA execution on the exact source; a zero-step Actions failure does not count as either PASS or source failure.
4. API/Web/Admin production builds must use lock-installed release tooling and controlled release workflows.
5. Automatic production mutation is not a substitute for the guarded release workflows.
6. Every production mutation workflow, including DB migration, must require the repository's existing approval/verification guards.
7. Schema migration is a separate production-sensitive action. Preparing a migration in a branch does not authorize applying it.

## Internet Voice launch gate

Internet Voice is the primary v1.2 call transport. Public paid Caller service cannot open until all of these are real and tested:

- authenticated caller and listener can establish a real two-way Internet Voice session;
- signaling is operational on Web/PWA and Android;
- a real TURN/TURNS relay is configured for production; STUN-only or local peer-to-peer success is insufficient;
- call business state is transport-neutral and does not depend on PSTN-only fields;
- billing starts only after **both sides are media-connected**;
- short reconnect does not create a new financial session;
- user-ended, technical-drop and safety-ended paths settle safely and idempotently;
- a real 10/30/60 minute HOLD is reserved before the offer and only actual connected time is charged;
- +15 and +30 minute extensions reserve additional credit without ending the call;
- 2-minute and 1-minute remaining-time warnings are available to clients;
- Instant no-answer completes at about 90 seconds, charges zero, releases the HOLD, auto-offlines the missed Listener and offers alternatives;
- call connection success, request-to-accept-to-connected timing, no-answer, reconnect and technical-drop metrics are emitted from real events.

Masked PSTN may be enabled later per market when provider contract, legal/policy requirements and production credentials are real. Its absence must not block the Internet Voice launch.

## Iran domestic survival-path gate

The architecture must preserve an Iran-to-Iran path for rare international-internet cutoffs. This is a separate readiness item from normal global Internet Voice:

- domestic control-plane endpoint is hosted/reachable inside Iran;
- domestic TURN/media relay is hosted/reachable inside Iran;
- Iran-to-Iran signaling and media have a tested selection/failover path;
- tests do not claim cross-border service during a total international cutoff.

The normal launch can proceed only when the project's chosen launch-readiness decision for this path is explicitly recorded; code must never report the domestic path as configured merely because global Internet Voice works.

## API production gate

Before API production is considered ready:

- the exact production database is verified read-only by the repository verifier;
- required v1.2 migrations are applied only through the approved exact-target migration path;
- post-migration read-only verification passes;
- `/health` and `/ready` pass for the exact release source;
- `/v1/bootstrap` returns the active market, currency-aware pricing, `internet_voice` primary transport, fallback state, session presets and public-release configuration;
- real Email OTP delivery, verify, authenticated session and logout/revocation E2E passes;
- production dev OTP and development call providers remain forbidden.

## Web/PWA paid Caller gate

Web/PWA is a real Caller launch client in v1.2, not only a marketing site. Before paid launch it must support end-to-end:

- sign-in and age eligibility;
- listener browse / fast match;
- Instant and Booking entry points;
- closed-loop wallet balance and top-up;
- fixed 10/30/60 minute session-cap selection;
- microphone permission and real Internet Voice call UI;
- call timer, 2-minute/1-minute warnings and +15/+30 extension;
- no-answer alternatives with zero-charge messaging;
- in-call end and safety exit;
- post-call duration, actual charge, Favorite/Repeat, Rating and Report;
- installable PWA behavior where supported.

The public Privacy, Terms, Account Deletion and Support surfaces remain required. Admin stays protected.

## Wallet, billing and pricing gate

- Wallet remains closed-loop for «یکی هست» services only.
- Ledger amounts use `amount_minor` + `currency_code`; UI display rules are market-specific.
- Initial session selection is a maximum/HOLD, not prepaid burned minutes.
- HOLD reserve, extension, consume and release behavior must be auditable and idempotent.
- Iran Wave-1 future-call pricing is 4,000 toman caller / 2,800 toman Listener / 1,200 toman gross platform spread per connected minute before variable costs.
- Existing call history must retain its snapshotted rates when price books change.
- Listener base payout must not change merely because the Caller is foreign.

## Payment-rail gate

Payment architecture remains provider-independent and market-configurable.

For the first paid launch scope:

- at least one real Iran wallet top-up rail must be operational for Iran callers;
- at least one acceptable international card rail must be operational before paid diaspora/North-America callers are opened;
- provider onboarding, settlement, refund and fee behavior must be verified with the actual merchant/account configuration;
- no provider name becomes a hard-coded business-domain assumption;
- refunds follow market policy and, where possible, return to the original payment method;
- manual transfer may remain an operational fallback but is not the primary Caller purchase UX.

## Listener / Instant / Booking gate

- approved Listener can set real Now Available status and future availability;
- Now Available means ready to answer and heartbeat/presence expiry is enforced;
- routing respects language, gender eligibility, blocks and safety preferences;
- Listener does not see Caller country, payment currency or platform margin before accepting;
- first eligible Miss may receive grace, but the Listener is auto-offlined;
- repeated unjustified Miss/No-show events feed Reliability and queue priority;
- Booking keeps numbers private and initiates the same transport-neutral CallSession model.

## Profile trust gate

Public Listener profile must distinguish platform-verified fields from self-declared fields. Unverified bio, education, employment/history, interests or similar claims must never be rendered as verified. Private KYC/banking/real-name data never becomes public profile data.

## Safety / recording gate

Before the first real paid beta call:

- caller and listener safety exit paths are usable;
- report categories and incident records work;
- crisis protocol is documented, trained and operational;
- serious safety actions are auditable;
- prohibited sexual-service behavior, harassment, threats, off-platform solicitation and contact-sharing rules are represented in conduct/training/operations.

Recording architecture may remain capable but disabled. If recording is activated publicly, both sides must receive clear notice and explicit consent before connection; hidden recording and public replay/download are prohibited. Store/privacy/payment policy must be re-checked before activation and retention must be configurable.

## Listener quality / bonus gate

Listener base compensation is separate from bonuses. Quality/bonus instrumentation must be able to combine Reliability, valid Rating, Repeat, Completion, Reports/Safety signals and sufficient sample size. Rating alone must not determine bonus eligibility, and review manipulation must be detectable/operationally enforceable. Bonus formulas remain versioned and data-driven.

## Android / Google Play gate

Android is part of the first v1.2 launch. Store-ready status requires:

- Android source contains the real Internet Voice client and microphone permission/handling;
- signed production AAB is built from the exact release source;
- Google Play developer account and signing/store credentials are real;
- store metadata, Data Safety/privacy declarations and policy statements match actual behavior;
- install/update/login/payment/call/notification flows are tested on real Android devices;
- Listener work mode and incoming-call notification behavior are tested under background/app-resume conditions;
- Play review/publishing status is recorded from the real console.

The Founder has already approved the Google Play developer fee up to USD 25. This approval does not cover other paid services.

## iOS / Apple

iOS is **Coming Soon** for this release. Apple Developer/App Store purchase is not approved and is not a launch gate for Web/PWA + Android. Do not purchase or activate Apple paid enrollment without new explicit approval.

## Commercial hosting gate

Paid traffic requires hosting terms/plan eligibility for the intended commercial workload. Current hosting state must be verified against the actual account and current terms before Caller is opened.

## Definition of v1.2 launch-ready

Do not mark the project launch-ready until all gates applicable to Web/PWA + Android paid launch are green on the exact release source. At minimum:

- current source has a real full Foundation QA PASS;
- required production schema changes have been explicitly approved, applied through the guarded path and verified;
- Internet Voice works end-to-end with real relay infrastructure;
- HOLD, actual-time billing, +15/+30 Extend, 90-second no-answer and reconnect behavior pass real QA;
- Web/PWA completes the paid Caller journey;
- Android signed release completes the same core journey and Listener work-mode checks;
- required Iran and opened foreign payment rails pass real provider verification;
- Safety/Crisis, Rating/Report and Reliability/Quality instrumentation are operational;
- public policy/support surfaces and commercial hosting gate are valid;
- masked PSTN remains optional fallback;
- iOS remains Coming Soon unless separately approved.
