# یکی هست — Google Play Developer Account Readiness

Last checked against Google documentation: 2026-09-07

Purpose: make the owner-controlled Google Play account step fast and avoid an avoidable launch delay. This file does not authorize account creation, identity submission, or payment.

## Recommended account-type decision gate

Google directs developers to use an **Organization** developer account when the account is for an organization/business or commercial/professional activity.

For `یکی هست`, do not silently create a Personal account merely because it is faster. The owner must confirm the legal publishing entity, and the Play payments profile / D-U-N-S / organization documents must match that same entity.

Google's mandatory `12 testers for 14 continuous days` production-access rule applies to new Personal developer accounts created after 13 November 2023. Google's official testing-requirements article scopes that gate to Personal accounts. Do not misclassify an account merely to bypass policy.

## Registration fee

Google currently states a one-time USD $25 developer registration fee for full distribution.

No payment is authorized by this document. Stop before payment and obtain explicit owner approval.

## Organization account information to prepare

For an Organization developer account, prepare the exact real values for:

- Developer name
- Linked Google Payments profile
- D-U-N-S number
- Legal organization name
- Legal organization address
- Organization phone number
- Organization website
- Contact name
- Contact email
- Contact phone
- Developer email shown on Google Play
- Developer phone shown on Google Play

Contact/developer email and phone values must remain operational and may be OTP-verified by Google.

Do not invent or normalize company identity data. Legal name/address in Google Payments must match the D-U-N-S / organization evidence.

## Turkey verification documents

For Organization accounts with Turkey as the payments-profile country, Google's current acceptable evidence includes:

### Organization registration evidence

One of:

- Chamber of commerce registration certificate
- Tax certificate

### Authorized representative photo ID

One of:

- Passport
- Identification card
- Driving license
- Permanent residence card

The authorized representative must actually have authority to represent the organization. Use clear, valid, unmodified documents whose identity details match the account information.

## D-U-N-S gate

A D-U-N-S number is required for ordinary Organization developer accounts.

Before starting Organization account registration:

1. Confirm the exact legal entity that will publish the app.
2. Confirm its exact registered legal name and address.
3. Check whether that exact entity already has a D-U-N-S number.
4. If not, obtain one through the legitimate D&B/Google-supported path.

Do not use a D-U-N-S belonging to a different related company or holding entity.

## Public developer identity implications

Google may display organization/developer identity information on Google Play, including legal/developer contact information under its current transparency rules. Choose the publishing entity intentionally before registration.

## What is already ready before account creation

Repository-side Android preparation is aligned to v1.2 vc5:

- final signed Android AAB: `1.0.0`, versionCode `5`;
- package: `app.yekihast.mobile`;
- target SDK: API 36;
- EAS build ID: `51dc645a-b56f-4428-91b5-73337898f870`;
- final AAB SHA-256: `f843909c6a239d784f38c97c304310a64a7e4ab5c59410cd905de8b89bd06e32`;
- exact vc5 archive artifact ID: `10031041956`;
- listing icon ready;
- feature graphic ready;
- physical-device screenshot kit artifact ID: `10031149382`;
- Android permission surface verified: `RECORD_AUDIO` present, camera absent;
- production Caller/voice gate independently verified closed;
- current filing baseline: Microphone permission **Yes**, current production Audio collection/sharing **No** while Caller/voice remains closed.

The privacy page and production bootstrap legal URLs must be reconciled to this verified state before final Play submission. Do not rebuild the Android binary merely because account setup or Store metadata changes.

## Owner-controlled sequence when work resumes

1. Owner confirms the legal publishing entity and account type.
2. Check/obtain D-U-N-S for that exact entity.
3. Gather matching organization verification evidence and authorized-representative ID.
4. Choose the Google Account that will own the Play developer account.
5. Start Play Console signup and link/create the matching Organization Google Payments profile.
6. Verify email/phone and organization/identity information.
7. Stop at the one-time registration payment until explicit owner approval is given.
8. After account activation, create the app record for `app.yekihast.mobile`.
9. Upload the exact vc5 AAB and continue from `GOOGLE_PLAY_FINAL_PACKET.md`.
10. File current Audio collection/sharing as documented in the final packet while Caller/voice remains closed.

TURN/provider verification is not a current account-registration or Store-submission blocker because public Internet Voice is disabled. If Caller/voice is opened later, verify the actual provider/runtime and update Privacy/Data Safety before enabling it.

## Do not do

- Do not create a Personal account by default if the publisher is actually a business.
- Do not fabricate a legal entity or D-U-N-S value.
- Do not pay the registration fee without explicit approval.
- Do not upload identity documents into GitHub or chat.
- Do not put Play credentials/secrets in source.
- Do not rebuild vc5 for account setup or Store metadata.
- Do not open Caller/voice after filing current Audio collection as No without updating Privacy/Data Safety first.
- Do not touch Apple/iOS while the Android-first path is active.

## Official references

- Choose developer account type: https://support.google.com/googleplay/android-developer/answer/13634885
- Required Play developer account information: https://support.google.com/googleplay/android-developer/answer/13628312
- New Personal-account testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- Get started / one-time registration fee: https://support.google.com/googleplay/android-developer/answer/6112435
- Turkey verification documents: https://support.google.com/googleplay/android-developer/answer/15633622?co=GENIE.CountryCode%3DTR&hl=en
