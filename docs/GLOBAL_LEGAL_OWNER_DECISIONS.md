# GLOBAL LEGAL OWNER DECISIONS

Project: Listener APP / «یکی هست»  
Fact-audit baseline: `ec167fdccf2e754a634ed347f9ae2d442c9a0e54`  
Audit date: 2026-09-08

This document records product-policy gaps found in the repository. It is not legal advice and does not treat an unresolved point as a production fact.

## FACT AUDIT

### PROVEN CURRENT FACT

- Current public legal/support surfaces are `https://yekihast.app/privacy`, `https://yekihast.app/terms`, `https://yekihast.app/account/delete`, and `sales@uniqueholding.com.tr`.
- Public Caller / Internet Voice is closed in the audited production state. The repository records `CALLER_CLOSED_BETA_ENABLED=false`, `COMMERCIAL_HOSTING_APPROVED=false`, no configured TURN/ICE relay, and no configured public payment/KYC/payout providers for that state.
- The final Android binary requests microphone permission (`RECORD_AUDIO`) and does not request camera or Advertising ID.
- The current mobile and web dependency manifests contain no advertising SDK.
- Internet Voice code uses WebRTC signaling. The backend route stores offer/answer/ICE and connection-state signaling, not conversation-audio files. `app.internet_voice_signals` has a five-minute default expiry and expired rows are deleted opportunistically by the signaling route.
- The audited backend contains no conversation-audio recording/storage route. This proves platform implementation behavior; it does not prove that a participant or another device cannot record.
- Web authentication stores the session token in an `HttpOnly` cookie, uses `Secure` in production, and sets `SameSite=strict`. Mobile session tokens use Expo SecureStore.
- A self-service deletion request revokes active sessions when the request is accepted.
- For a clean account, the backend physically deletes `app.users`, removes OTP challenge rows keyed to the account identity hashes, and relies on configured cascades for account-owned data.
- For deletion audit history, direct user/account linkage and IP hash are removed; a minimal non-identifying completion record can remain.
- If a retention-sensitive foreign-key relationship prevents physical deletion, the destructive transaction fails atomically and the request remains pending/review-required while session revocation remains committed.
- Active admin accounts cannot use the normal self-service destructive deletion path without transfer/handling first.
- The repository contains an age-visibility helper that accepts a verified age from 18 to 100. That helper is a display rule, not proof of a product-wide 18+ eligibility policy.

### CLOSED / FUTURE CAPABILITY

- Public Internet Voice is implemented in code/binary but closed in the audited production state.
- TURN relay support exists as a technical capability but was not configured in the audited public production state.
- Payment, external KYC inquiry, and payout adapters exist but were not configured for the audited public production state.
- Any future opening of voice, payment, KYC, payout, or other closed capability requires Privacy/Data Safety/Terms reconciliation against the actual runtime before public enablement.

### UNKNOWN

The audited repository does not establish these as final public facts:

- legal operator/controller identity for the service;
- legal notice/controller address;
- a dedicated privacy contact or designation that the current support mailbox is the privacy contact;
- a category-by-category retention schedule for retention-sensitive financial, call, safety, operational, or audit data;
- a product-wide age/minors eligibility and consent policy;
- final participant-recording consent/enforcement mechanics beyond the Terms conduct rule;
- data-hosting regions, international transfer model, or a global subprocessor register;
- an owner-approved policy statement on sale of personal data or targeted-advertising use beyond the proven current absence of Advertising ID/ad SDKs;
- a dedicated safety/escalation contact distinct from general support.

### OWNER DECISION

The decisions below must be resolved by the owner before the affected public launch surface is opened or marketed globally.

---

## 1. OPERATOR / CONTROLLER IDENTITY

**DECISION**  
Choose the exact legal person or entity that operates «یکی هست» and is responsible for the privacy notice and Terms.

**WHY IT MATTERS**  
Global-facing legal pages should identify who users are dealing with. A product brand, repository owner, Expo owner, or support-domain name is not enough to infer a legal controller.

**WHAT REPO PROVES**  
The repository proves the product name, public URLs, Expo owner and current support email. Store-readiness documents explicitly treated the legal publishing entity as an owner-controlled decision at the audited baseline.

**WHAT IS UNKNOWN**  
The final legal operator/controller identity.

**OPTIONS**  
1. A named individual operates the service.  
2. A verified company/legal entity operates the service.  
3. Another documented legal structure is selected after professional review.

**RECOMMENDATION**  
Use the exact real publisher/operator that will own user-facing obligations and ensure the same identity is consistent across Store accounts, Terms, Privacy and payment/provider contracts.

**LAUNCH CONSEQUENCE**  
Do not present the service as globally legally complete until the operator/controller identity is fixed and added to the legal surfaces.

---

## 2. LEGAL / PRIVACY NOTICE ADDRESS

**DECISION**  
Decide what valid address, if any, must be published as the operator/controller contact address for the intended launch jurisdictions and publishing structure.

**WHY IT MATTERS**  
The current repository has no verified public legal address. Inventing one creates a more serious trust problem than leaving the field unresolved internally.

**WHAT REPO PROVES**  
No final controller/legal notice address is established in the audited source of truth.

**WHAT IS UNKNOWN**  
The correct address and whether the selected operator structure requires it to appear on these pages.

**OPTIONS**  
1. Publish the verified legal/business address of the selected operator where appropriate.  
2. Use another legally valid notice address after professional review.  
3. If publication is not required for the selected structure/jurisdictions, document that decision and basis outside product copy.

**RECOMMENDATION**  
Resolve this together with operator identity rather than independently.

**LAUNCH CONSEQUENCE**  
Global legal readiness remains incomplete until this is decided.

---

## 3. PRIVACY CONTACT

**DECISION**  
Designate the mailbox/process for privacy questions and data-rights requests.

**WHY IT MATTERS**  
`sales@uniqueholding.com.tr` is proven as the current public support email, but the repo does not prove that it is a dedicated privacy channel or describe a privacy-request workflow.

**WHAT REPO PROVES**  
The public release configuration requires a support email and current Store documents identify `sales@uniqueholding.com.tr` as support.

**WHAT IS UNKNOWN**  
Whether general support should handle privacy requests, who owns those requests, and what response process applies.

**OPTIONS**  
1. Formally designate the current support address for privacy requests.  
2. Create a dedicated privacy mailbox under the product/operator domain.  
3. Use a ticketed privacy workflow after it actually exists.

**RECOMMENDATION**  
Use a dedicated privacy address once the operator identity/domain is final. Until then, keep the existing support email as a general contact without claiming a dedicated privacy office or process.

**LAUNCH CONSEQUENCE**  
Resolve before marketing to privacy-sensitive U.S./EU users or adding jurisdiction-specific privacy-rights promises.

---

## 4. RETENTION SCHEDULE

**DECISION**  
Approve a retention matrix by data category and deletion state.

**WHY IT MATTERS**  
The backend accurately distinguishes immediate physical deletion from review-required deletion, but it does not define business/legal retention periods for every protected relationship.

**WHAT REPO PROVES**  
Account-owned data can cascade on clean deletion. Ledger, call, safety and other retention-sensitive relationships can block physical deletion. Signaling data for Internet Voice has a five-minute schema expiry. Audit linkage is redacted during completed account deletion.

**WHAT IS UNKNOWN**  
Retention periods and deletion/anonymization triggers for financial records, call metadata, safety records, support records and other retention-sensitive rows.

**OPTIONS**  
1. Define minimum necessary periods per category based on real operational/legal obligations.  
2. Separate operational retention from legal hold/safety exception handling.  
3. Add automated expiry only after the approved policy exists.

**RECOMMENDATION**  
Create a category-level retention schedule with owner + legal/accounting review. Do not put invented day/month/year periods into Privacy before this decision.

**LAUNCH CONSEQUENCE**  
Public voice/payment expansion should remain blocked from “global legal ready” status until this matrix is approved.

---

## 5. AGE / MINORS

**DECISION**  
Set the minimum age and minors policy for account creation, Caller use and Listener participation.

**WHY IT MATTERS**  
Human-to-human private conversation creates safety, consent and moderation questions that cannot be solved by a UI age label alone.

**WHAT REPO PROVES**  
The age-visibility helper only accepts a verified age between 18 and 100. Some payment visibility logic references age gating. The repo does not establish a product-wide public 18+ Terms rule or a minors consent/safety flow.

**WHAT IS UNKNOWN**  
Whether the intended public service is adults-only; whether minors may create accounts; parental consent requirements; how age is verified; and whether Listener participation has a different threshold.

**OPTIONS**  
1. Adults-only public conversation/listener service at launch.  
2. Permit minors only after a dedicated minors safety/consent design is implemented and reviewed.  
3. Different thresholds by capability, provided the rules are explicit and enforced.

**RECOMMENDATION**  
For the first public human-conversation release, use an adults-only model unless the owner deliberately funds and implements a minors-specific safety, consent and moderation system. This is a product-safety recommendation, not a legal conclusion.

**LAUNCH CONSEQUENCE**  
Do not open public Caller/Listener conversation until the age policy is explicit in product gating and Terms.

---

## 6. PARTICIPANT RECORDING / REDISTRIBUTION POLICY

**DECISION**  
Confirm the final rule for participant recording and any future exception/consent mechanism.

**WHY IT MATTERS**  
The platform currently has no backend conversation-audio recorder, but a participant can potentially use operating-system or external-device recording. Privacy copy cannot honestly promise that nobody can record.

**WHAT REPO PROVES**  
Current platform implementation has no conversation-audio recording/storage route. The Terms branch now prohibits recording, redistribution and identifiable story publication without the required permission.

**WHAT IS UNKNOWN**  
Whether future product policy will be an absolute participant-recording ban or allow mutually authorized recording, and how any consent would be captured/enforced.

**OPTIONS**  
1. Prohibit participant recording entirely under product rules.  
2. Allow only explicit mutual consent with a real in-product consent mechanism.  
3. Add platform recording only after a separate notice/consent/retention design exists.

**RECOMMENDATION**  
Keep platform recording off by default. For launch, prohibit participant recording unless the owner intentionally builds a consent flow and updates Privacy/Terms before enabling it.

**LAUNCH CONSEQUENCE**  
The conduct rule can ship now; any recording feature or consent exception requires a new review before release.

---

## 7. INTERNATIONAL DATA HANDLING / SUBPROCESSORS

**DECISION**  
Approve the actual hosting/service-provider inventory, processing locations, and international-transfer position for intended launch markets.

**WHY IT MATTERS**  
A code repository can show integrations and deployment tooling, but it does not by itself prove the contractual entity, processing region, transfer mechanism or final subprocessor list used in production.

**WHAT REPO PROVES**  
The service uses external infrastructure for hosting/database/email and has adapters for additional providers. The repo does not establish a final global data-location/transfer policy.

**WHAT IS UNKNOWN**  
Actual contracted provider entities, selected regions, transfer arrangements and the subprocessor disclosure required for the selected operator/jurisdictions.

**OPTIONS**  
1. Publish a provider/subprocessor disclosure based on real production contracts and regions.  
2. Keep the Privacy wording provider-neutral until that inventory is verified.  
3. Add jurisdiction-specific transfer language only after legal review of the real architecture.

**RECOMMENDATION**  
Create a production subprocessor/data-flow register from real contracts/configuration, then update Privacy. Do not infer region or transfer law from source code.

**LAUNCH CONSEQUENCE**  
Required before claiming EU/global privacy readiness.

---

## 8. SUPPORT / SAFETY ESCALATION CONTACT

**DECISION**  
Choose whether general support is also the safety-report contact or create a distinct safety escalation channel.

**WHY IT MATTERS**  
Terms can prohibit harassment and unsafe conduct, but users need a real destination for reports once public human conversation opens.

**WHAT REPO PROVES**  
A general public support email exists and backend/admin safety workflows exist. No dedicated public safety mailbox is established by the audited source.

**WHAT IS UNKNOWN**  
Who monitors safety reports, the contact address, escalation ownership and service expectations.

**OPTIONS**  
1. Designate general support as the safety-report channel.  
2. Create a dedicated safety mailbox/workflow.  
3. Add in-product reporting only after the route/process actually exists.

**RECOMMENDATION**  
Before public Caller launch, create a dedicated safety contact or formally designate and staff the existing support channel for safety reports.

**LAUNCH CONSEQUENCE**  
Public human-to-human conversation should not launch without a clear safety-report destination.

---

## 9. DATA SALE / TARGETED ADVERTISING POLICY

**DECISION**  
Approve an explicit business policy on sale of personal data and use of personal data for targeted advertising.

**WHY IT MATTERS**  
Current code can prove the absence of Advertising ID/ad SDKs in this version, but absence of an SDK does not prove a permanent business-policy commitment.

**WHAT REPO PROVES**  
The exact Android release does not request Advertising ID; current web/mobile dependency manifests contain no advertising SDK; Store filing baseline says Ads: No.

**WHAT IS UNKNOWN**  
The owner-approved long-term policy on data sale, targeted advertising and any future advertising model.

**OPTIONS**  
1. Adopt and document a no-sale/no-targeted-advertising policy.  
2. Keep the product ad-free now without making a permanent policy commitment.  
3. Introduce an advertising model later only after privacy/store disclosures and consent choices are updated where required.

**RECOMMENDATION**  
If consistent with the business plan, formally adopt no sale of personal data and no targeted advertising. Only then add that promise to public Privacy copy.

**LAUNCH CONSEQUENCE**  
Current ad-free implementation can ship as a factual implementation statement; a broader “we never sell your data” claim must wait for owner approval.
