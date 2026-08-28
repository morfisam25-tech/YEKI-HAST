# Production Telephony Integration Gate

Status: BLOCKED ON PROVIDER CONTRACT — do not implement provider behavior by inference.

## Application contract

The production provider adapter must satisfy `services/api/src/providers/telephony.ts` without weakening fail-closed call semantics:

1. Create a two-leg masked bridge from the server to Caller + Listener.
2. Return a stable provider bridge/call identifier.
3. Prevent duplicate real bridges for the same application `callSessionId` when a provider request is retried or its result is ambiguous, either through provider idempotency or a documented lookup/reconciliation mechanism.
4. Enforce `maxConnectedSeconds` as a hard connected-time cap when supported.
5. Terminate an active bridge by stable provider identifier for Caller Cancel and Safety Exit.
6. Provide documented lifecycle callbacks/status sufficient to reconcile ringing/answered/connected/ended/failed states and final duration.
7. Authenticate callbacks or otherwise provide a documented way to verify provider-originated lifecycle events.
8. Provide a status/reconciliation lookup for ambiguous create/terminate results, or explicitly document equivalent semantics.

## Current candidate gate

### Dialing — PRIMARY CANDIDATE

Public product material advertises API access, webhook access and Secure Call API. Exact production request/response schemas, stable call ID, idempotency/reconciliation semantics, immediate termination API and webhook authentication are still required before implementation.

Action: technical documentation/request sent to vendor on 2026-08-28. Do not add a production adapter until the vendor response establishes the required semantics.

### Simotel — TECHNICAL FALLBACK

Public documentation establishes:
- two-way Originate / Number Masking API;
- `call_limit` for call duration;
- returned `originated_call_id`;
- CDR/webhook data carrying originated call identity and duration.

Blocking gap: no public, verified immediate bridge-termination endpoint by `originated_call_id` has been established for our Safety Exit / Cancel contract. Hosted PBX/trunk/network requirements must also be resolved before choosing this path.

### Callmee / alo021 — MANAGED FALLBACK

Public documentation establishes two-leg masked secure calls and an optional `timelimit` parameter.

Blocking gaps: public stable response identifier, idempotency/reconciliation behavior, immediate termination API and lifecycle webhook contract are not established.

## Implementation rule

A provider may be enabled in production only after all mandatory contract items above are supported by verified provider documentation or vendor-provided API documentation. Until then, production telephony must remain fail-closed.
