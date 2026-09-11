# W15 SMS authentication readiness

Date: 2026-09-11
Branch: `w15/sms-auth-readiness-20260911`

## Existing architecture found

The repository already contained a server-side SMS provider interface, an SMS.ir Verify adapter, phone OTP request/verify routes, hashed OTP challenges, session issuance, per-phone/IP/global rate limits, a five-attempt verification ceiling, expiry checks, single-use consumption, and a separate working Email OTP path. Historical commits show the SMS.ir Verify adapter was added before the mobile login UI moved to Email OTP as the primary visible method.

W15 keeps the Email OTP route and provider unchanged. SMS OTP is an additional login method and uses the same `app.users` identity and `private_data.auth_sessions` session model.

## W15 changes

- Iranian mobile input is normalized to E.164 (`+989...`) and non-Iran/non-mobile inputs are rejected for SMS login.
- An explicit 60-second resend cooldown is enforced server-side in addition to the existing 15-minute rate limits.
- Existing OTP expiry, five-attempt ceiling, hashing, single-use consumption and replay protection remain in force.
- Provider failures are reduced to the application-level `sms_delivery_unavailable` error; provider response bodies and credentials are not returned to clients.
- The development SMS provider remains impossible to select when `NODE_ENV=production`.
- SMS.ir remains the primary production adapter and production still fails closed until the Verify template is marked approved.
- The existing mobile auth screen now offers both `ورود با ایمیل` and `ورود با شماره موبایل` without changing the W9 web Home.

## Identity and linking strategy

A person may have an email identifier, a phone identifier, or both. Both identifiers belong to one `app.users.id` when they have been explicitly linked.

W15 does not perform heuristic identity merging. A matching name, device, IP address or other soft signal is never enough to merge two users. A first-time verified phone may create a phone-only user; a first-time verified email may create an email-only user. Adding the second identifier to an existing user must happen while that user has an authenticated session and after ownership of the new identifier is separately verified.

The schema already supports both verified email and verified phone state on the same user. It also prevents the same phone hash from being casually attached to multiple users. If an identifier is already owned by another user, the correct path is account recovery/support or an explicit merge procedure, not an automatic merge.

The current `account-contact` route is Caller-specific and is not treated as a generic account-merge mechanism. A future account-settings surface may expose explicit second-identifier linking, but public phone login itself must remain usable for phone-only users.

## Provider readiness

SMS.ir current public documentation uses `https://api.sms.ir/v1/send/verify`, authenticates with `X-API-KEY`, requires a panel-defined Verify template for production, and publishes a Sandbox using the same API shape without sending real SMS. Public documentation describes IP allowlisting as an optional restriction mechanism rather than a requirement for Iranian-origin servers.

No SMS.ir account, invoice, API activation notice, template approval notice, or credentials were found in the connected project Gmail accounts during W15 review. No credential value was copied into this document or repository.

Until a real SMS.ir account/API key is confirmed, W15 can prove the application contract and automated tests but cannot send a real Production or Preview SMS.

## Production safety

W15 does not modify Production environment variables, does not deploy Production, and does not merge to `main`. Real SMS credentials remain server-side only. No hardcoded Production OTP is introduced.
