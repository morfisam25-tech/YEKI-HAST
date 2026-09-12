# W15 SMS authentication readiness

Date: 2026-09-11
Branch: `w15/sms-auth-readiness-20260911`
Draft PR: `#64` — QA only, do not merge

## Existing authentication architecture

Email OTP remains a separate working login path and is not modified by the SMS provider work.

SMS OTP uses backend-owned challenges in `private_data.otp_challenges`. The application owns OTP generation, hashing, TTL, resend cooldown, attempt limits, phone/IP/global rate limits, single-use consumption and session issuance. SMS providers are delivery transports only; they never verify the application OTP.

Iranian mobile input is normalized to E.164 (`+989...`) before hashing or storage. No heuristic account merge is performed. A phone identifier and an email identifier are linked only through an explicitly authenticated ownership flow.

## Provider-neutral contract

`services/api/src/providers/sms.ts` exposes `SmsOtpProvider` with:

- provider identity
- template/pattern identifier
- `sendOtp(...)`
- normalized send result
- optional provider reference/message ID
- normalized error kind
- retryable/permanent classification
- HTTP status classification without provider response-body leakage

Supported selectors:

- `SMS_PROVIDER=dev` — development only
- `SMS_PROVIDER=smsir`
- `SMS_PROVIDER=farazsms`

There is no automatic production fallback. If the selected provider is missing required configuration or approval flags, the SMS request path fails closed with the application-level `sms_delivery_unavailable` response.

## SMS.ir adapter

Current contract used by the adapter:

- endpoint: `POST https://api.sms.ir/v1/send/verify`
- auth header: `X-API-KEY`
- body fields: `mobile`, integer `templateId`, `parameters[]`
- parameter model: `name`, `value`
- documented success envelope: `status=1`, `data.messageId`, `data.cost`
- HTTP 429 is normalized as retryable provider rate limiting
- HTTP 408/425/5xx and network failures are normalized as retryable temporary failures
- HTTP 400/401/403 and other non-retryable HTTP failures are normalized as permanent provider failures

The adapter sends the normalized Iranian mobile in SMS.ir's documented national form without country prefix or leading zero, for example `9123456789`.

Production additionally requires `SMSIR_OTP_TEMPLATE_APPROVED=true`. This must remain false while the current template is rejected.

Operational state supplied by Central PM:

- real account exists and is accessible
- existing YEKI-HAST API key is active; its value is not stored in the repository or this document
- existing OTP template is rejected pending provider reconsideration/requirements clarification
- no second API key is needed

## FarazSMS / IranPayamak adapter

The FarazSMS account uses the current IPPanel Edge API contract.

Current contract used by the adapter:

- endpoint: `POST https://edge.ippanel.com/v1/api/send`
- auth header: `Authorization: <API key/token>`
- body `sending_type`: `pattern`
- sender: `from_number` in E.164
- pattern identifier: `code`
- recipient: a one-item `recipients` array in E.164
- pattern parameters: `params` object whose keys match the approved pattern placeholders
- successful send APIs use the common `data` / `meta` envelope; when `message_outbox_ids` or another documented reference field is returned, W15 normalizes the first reference into `providerReferenceId`
- Pattern documentation may omit a response body, so an HTTP 2xx empty response is accepted without inventing a reference ID

Production additionally requires `FARAZSMS_OTP_PATTERN_APPROVED=true` and all of:

- `FARAZSMS_API_KEY`
- `FARAZSMS_PATTERN_CODE`
- `FARAZSMS_FROM_NUMBER`

Operational state supplied by Central PM:

- fallback account/profile exists
- initial panel payment is complete
- identity documents were uploaded
- approval is pending
- no API key has been created yet
- no dedicated line, extra package or unrelated commitment form should be purchased/uploaded unless the provider explicitly proves it is required for OTP

The adapter does not assume that a dedicated line is mandatory. It requires a configured sender number only when the provider makes an approved Pattern sender available for the account.

## Security and observability

Preserved controls:

- Iran mobile normalization to `+98`
- 60-second resend cooldown
- OTP TTL
- five-attempt verification ceiling
- per-phone request limit
- per-IP request limit
- global request limit
- single-use challenge consumption
- hashed OTP storage
- no account enumeration in request flow
- provider credentials server-side only
- dev OTP exposure impossible outside `NODE_ENV=development`
- dev SMS provider impossible in Production
- no OTP or mobile number is written to provider audit logs

After a provider accepts a send, server logs may record only:

- challenge ID
- provider name
- template/pattern identifier
- provider reference ID when returned

This is sufficient for the one-message Preview/internal-beta live E2E audit without logging the OTP or phone number.

## Tests

Provider unit/contract tests cover both adapters:

- documented endpoint and auth header
- payload shape and phone format
- provider reference normalization
- production configuration guard
- approval guard
- retryable provider failure
- provider rate limiting
- permanent provider failure
- response-body sanitization

A dual-provider mocked OTP contract harness covers, for both `smsir` and `farazsms`:

- request accepted
- correct OTP verification
- wrong OTP
- OTP replay rejection
- expiry
- resend cooldown / duplicate request
- excessive verification attempts
- per-phone request limiting
- temporary provider failure
- hard provider failure
- safe retry after a failed delivery challenge is consumed

The production route invariants separately assert the real SQL-backed TTL, cooldown, attempt, phone/IP/global rate-limit and single-use conditions.

## Foreign-cloud connectivity

The W15 GitHub Actions reachability workflow performs credential-free checks from a GitHub-hosted Ubuntu runner for:

- `api.sms.ir:443` and `https://api.sms.ir/v1/send/verify`
- `edge.ippanel.com:443` and `https://edge.ippanel.com/v1/api/send`

The check records DNS resolution, TLS handshake and a non-`000` HTTPS response. It sends no API credential, OTP, SMS or transaction.

## Minimum live E2E after one provider is approved

Preview/internal-beta only:

1. Put exactly one provider credential and its approved template/pattern configuration into the isolated Preview/internal-beta environment.
2. Keep Production unchanged.
3. Set `SMS_PROVIDER` to that provider; do not configure automatic fallback.
4. Use one controlled Iranian mobile number.
5. Request exactly one OTP.
6. Confirm server audit contains provider name and provider reference when returned, with no phone/OTP in logs.
7. Enter the received OTP once and verify a normal application session is issued.
8. Confirm replay fails.
9. Remove the Preview provider secret/config after the controlled test if it is not needed for continued internal beta.

No Production enablement or merge is part of this live test.

## Current provider classification

SMS.ir: `WAITING PROVIDER` — account/API key are operational, but the OTP template remains rejected.

FarazSMS: `WAITING PROVIDER` — account and documents exist, but identity/account approval and API/Pattern availability are pending.

Current preference remains SMS.ir as PRIMARY because the real account and API key already exist, the Verify API is purpose-built for service/OTP delivery, and foreign-cloud reachability was previously proven. FarazSMS is the FALLBACK because its current Edge API is suitable and the adapter is ready, but account/API/Pattern activation has not yet been granted.

If FarazSMS becomes fully approved first while SMS.ir continues to reject the production OTP template, Central PM can temporarily choose `SMS_PROVIDER=farazsms` for the controlled Preview E2E without changing the provider-neutral authentication state machine.

## Production safety

W15 does not merge to `main`, does not modify Production environment variables, does not deploy Production, does not create a provider secret, does not send a real SMS and does not purchase a line/package.
