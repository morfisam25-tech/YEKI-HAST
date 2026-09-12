# W15 SMS authentication readiness

Date: 2026-09-12
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

The adapter is aligned to the current official FarazSMS / IranPayamak Pattern endpoint documented at `docs.iranpayamak.com`.

Current contract used by the adapter:

- endpoint: `POST https://api.iranpayamak.com/ws/v1/sms/pattern`
- auth header: `Api-Key: <API key>`
- pattern identifier: `code`
- pattern attributes: JSON object `attributes`, keyed by approved placeholder names
- recipient: Iranian national mobile form `09xxxxxxxxx`
- sender/service line: `line_number` exactly as assigned/available to the account; it is not forced to E.164
- number format: `number_format: "english"` following the endpoint-specific current request example
- optional scheduling is not used by W15
- documented success: HTTP `201` with `{ "status": "success", "data": <number>, "messages": ... }`

The endpoint-specific Pattern page does not currently publish a complete Pattern-specific error-body catalog. W15 therefore does not depend on provider error-body text. It safely maps HTTP 401/403 to `authentication_failed`, 429 to `rate_limited`, 408/425/5xx and network failures to `temporary_unavailable`, and other non-2xx failures to `request_rejected`. A 2xx response whose parsed envelope does not declare `status: "success"` is treated as `request_rejected` without exposing its body.

Production additionally requires `FARAZSMS_OTP_PATTERN_APPROVED=true` and all of:

- `FARAZSMS_API_KEY`
- `FARAZSMS_PATTERN_CODE`
- `FARAZSMS_LINE_NUMBER`

`FARAZSMS_FROM_NUMBER` remains temporarily supported only as a backward-compatible fallback for the line value so existing non-production configuration does not break unexpectedly. New configuration must use `FARAZSMS_LINE_NUMBER`.

Operational state supplied by Central PM:

- account/profile exists
- identity documents are approved
- no additional identity/legal document is required for this code-alignment task
- account-level API-key availability still needs confirmation
- an ACTIVE OTP Pattern still needs confirmation
- an accessible shared/service sender line still needs confirmation
- account-level IP policy still needs confirmation
- no dedicated line, recharge, extra package or unrelated commitment form should be purchased/uploaded unless the provider explicitly proves it is required

The adapter does not assume a dedicated line is mandatory; it requires only a configured `line_number` that the provider makes available to the account.

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

## Tests

Provider unit/contract tests cover both adapters. Faraz-specific contract tests prove:

- current official endpoint and POST method
- `Api-Key` authentication header
- API key absent from request body
- `+989...` to `09...` recipient conversion
- `line_number`
- Pattern `code`
- configured OTP placeholder mapped into `attributes`
- `number_format: "english"`
- canonical `FARAZSMS_LINE_NUMBER` plus temporary `FARAZSMS_FROM_NUMBER` fallback
- HTTP 401/403 authentication classification
- HTTP 429 rate-limit classification
- HTTP 5xx and network temporary-failure classification
- provider-declared rejection classification
- valid provider success normalization
- no API-key/OTP/phone/provider-body leakage in thrown errors

SMS.ir contract tests remain unchanged and continue to run in the same provider test file.

The production route invariants separately assert the real SQL-backed TTL, cooldown, attempt, phone/IP/global rate-limit and single-use conditions.

## Live E2E gate

No real SMS is sent as part of adapter alignment. Controlled Preview/internal-beta E2E remains blocked until all provider-side account facts are confirmed:

1. API key exists and is active.
2. OTP Pattern is ACTIVE.
3. An accessible shared/service sender line exists.
4. Account-level IP policy is known.

After those are confirmed, one controlled Iranian number can be tested in Preview/internal-beta only. Production remains unchanged and there is no automatic provider fallback.

## Current provider classification

SMS.ir remains PRIMARY and `WAITING PROVIDER` because its account/API key are operational but its OTP template remains rejected.

FarazSMS remains SECONDARY/FALLBACK and `WAITING PROVIDER`: identity documents are approved and the adapter is aligned to the current official Pattern API, but API-key/Pattern/sender-line/IP-policy account gates still require confirmation before one live Preview OTP.

## Production safety

W15 does not merge to `main`, does not modify Production environment variables, does not deploy Production, does not create provider secrets, does not send a real SMS and does not purchase or recharge anything.
