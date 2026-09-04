# Scale Readiness — 1,000 calls/day launch envelope

Status: **architecture hardening in progress; real voice capacity not yet certified**.

This document defines the minimum engineering envelope for opening Caller. It is deliberately stricter than the current Technical Beta and must not be read as a claim that 1,000 real voice calls have already been load-tested.

## Target envelope

The first public operating target is:

- at least **1,000 call attempts/completions per day** without financial or lifecycle corruption;
- at least **100 simultaneously active calls** as the initial concurrency design point;
- hundreds of simultaneous API clients and at least a few thousand registered/online listeners without a database connection storm;
- burst-safe login, payment callback and telephony callback handling;
- correctness under duplicate, delayed, reordered and retried provider callbacks.

Daily volume is not the difficult part. Burst concurrency, polling fan-out, provider rate limits and database connection fan-out are the important constraints.

## Guarded now

### Database/serverless connections

- Production runtime database traffic is derived from the approved Neon endpoint and routed through the equivalent `-pooler` PgBouncer hostname.
- The GitHub production DB credential remains the previously approved direct endpoint so migration/deployment target fingerprinting is unchanged.
- Each warm API runtime is intentionally bounded to `DB_POOL_MAX=2`; the shared pooler is the cross-instance connection layer.
- Caller-open production verification rejects a direct Neon runtime hostname or a per-instance pool larger than two.
- Connection and idle acquisition timeouts remain bounded.

### Money and call correctness

Existing release guards preserve:

- caller request idempotency;
- one active-call boundary per caller;
- transactional wallet reservation and settlement;
- duplicate settlement protection;
- payment and wallet idempotency keys;
- durable provider-dispatch/termination intent before external side effects;
- fail-closed handling of ambiguous provider outcomes rather than blind retries;
- payout source locking and idempotent reconciliation.

These are correctness properties, not throughput benchmark results.

### External request bounds

- Gmail OAuth/send requests have bounded timeouts.
- NextPay provider requests have bounded timeouts.
- Browser backend proxies have bounded upstream timeouts.

### Listener polling fan-out

- The mobile listener active-call card no longer uses a fixed five-second interval while idle.
- It now uses an **adaptive/jittered schedule** rather than one synchronized fixed cadence.
- Foreground listeners with no active call use a jittered 20–30 second cadence.
- Once an active call exists, the cadence tightens to a jittered 3–5 seconds.
- Polling stops while the app is backgrounded and immediately refreshes when the app returns to the foreground.
- A per-component in-flight guard prevents overlapping active-call reads.
- Jitter prevents large groups of listener clients from synchronizing onto the same request boundary after app/resume or network events.

This materially reduces idle polling fan-out, but it is still a polling design. The read path must be included in the synthetic concurrency benchmark before the 1,000-calls/day envelope is called certified. A provider/push-driven state notification path remains a possible later optimization if measured load requires it.

Presence heartbeat is already much slower (30 seconds) and is foreground-aware, but it must be included in the same load model.

## Known capacity work before Caller opens

### Email OTP burst serialization

Email OTP issuance currently uses a global advisory transaction lock to make global rate limiting race-safe. This favors correctness over signup-burst throughput. Do not remove that lock without an equally race-safe distributed bucket/rate-limit design. It is not on the active-call hot path.

### Query/index proof

Production has indexes supporting caller/listener call history, wallet transactions, payment attempts, auth sessions and online listener presence. Do not add speculative indexes. Use `EXPLAIN (ANALYZE, BUFFERS)` against representative non-sensitive synthetic volume and add an index only where a measured hot query requires it.

## Hard external blocker: telephony capacity

There is still no enabled production telephony adapter. Therefore the system cannot truthfully be certified for 1,000 real calls/day yet. A real provider must be selected and its documented/contracted limits verified for:

- simultaneous calls/channels;
- call attempts per second / dial rate;
- callback/webhook delivery and retry policy;
- timeout and idempotency behavior;
- failure/reconciliation API;
- regional routing and operational availability.

Caller remains fail-closed until that provider gate and the existing commercial/provider gates are ready.

## Required proof before declaring this envelope certified

1. Foundation QA green on the exact release source.
2. Non-production synthetic API load test covering idle/active listener reads, call creation, lifecycle callbacks and settlement-safe duplicates.
3. No unexpected 5xx/connection exhaustion at the target burst envelope.
4. p95/p99 latency and database saturation observed, not guessed.
5. Real telephony provider sandbox/staging test for concurrency and callback retry behavior.
6. Small production canary before raising Caller exposure.

Until those checks exist, wording must remain **designed/hardened for the target**, not **benchmarked/certified at 1,000 calls/day**.
