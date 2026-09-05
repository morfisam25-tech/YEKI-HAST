# یکی هست — Google Play Developer Account Readiness

Last checked against Google documentation: 2026-09-05

Purpose: make the owner-controlled Google Play account step fast and avoid an avoidable launch delay. This file does not authorize account creation, identity submission, or payment.

## Recommended account-type decision gate

Google says to choose an **Organization** developer account when the account is for an organization/business or commercial/professional activity.

For `یکی هست`, do not silently create a Personal account merely because it is faster to start. The owner must confirm which legal entity will publish the app, and the Play payments profile / D-U-N-S / organization documents must match that same entity.

Important launch-timing difference:

- Google's mandatory `12 testers for 14 continuous days` production-access rule applies to **new Personal developer accounts created after 13 November 2023**.
- Google's official testing-requirements article scopes that rule to Personal accounts; an Organization account is not part of that new-Personal-account gate.

Therefore, if the app is legitimately published by a business entity, Organization registration is also the cleaner path for avoiding the new-personal-account production-access delay. Do not misclassify an account just to bypass policy.

## Registration fee

Google currently states a **one-time USD $25 developer registration fee** for full distribution.

No payment is authorized by this document. Stop before payment and obtain explicit owner approval.

Google notes that prepaid cards are not accepted and accepted card types can vary by location.

## Organization account information to prepare

Google currently requires the following for an Organization developer account:

- Developer name (public-facing; may differ from legal organization name)
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

Contact/developer email and phone values must remain operational and are OTP-verified by Google.

Do not invent or normalize company identity data. Legal name/address in Google Payments must match the D-U-N-S / organization evidence.

## Turkey verification documents — current Google list

For Organization accounts with Turkey as the payments-profile country, Google's current acceptable evidence includes two categories:

### 1. Organization registration evidence

One of:

- Chamber of commerce registration certificate
- Tax certificate

### 2. Authorized representative photo ID

One of:

- Passport
- Identification card
- Driving license
- Permanent residence card

Google defines an authorized representative as someone with legal authority to represent the organization, such as a CEO, director, or legal representative. The representative's ID can be issued in any country.

Documents and Google Payments data must match exactly for legal organization name/address and relevant identity details. Use clear, valid, unmodified documents.

## D-U-N-S gate

A D-U-N-S number is mandatory for ordinary Organization developer accounts.

Before starting Organization account registration:

1. Confirm the exact legal entity that will be the publisher.
2. Confirm its exact registered legal name and address.
3. Check whether that entity already has a D-U-N-S number.
4. If it does not, obtain one through the legitimate D&B/Google-supported path before attempting Play Organization onboarding.

Do not use a D-U-N-S belonging to a different related company or holding entity.

## Public developer identity implications

Google states that for Organization accounts it displays organization/developer identity information on Google Play, including legal name/address plus developer email/phone under its current transparency requirements.

Therefore choose the legal publishing entity intentionally before registration. This is an owner/legal/business decision, not a code decision.

## What is already ready before account creation

No account work is required to finish these repository-side items; they are already prepared:

- final signed Android AAB: `1.0.0`, versionCode `3`;
- package: `app.yekihast.mobile`;
- target SDK: API 36;
- final AAB SHA-256: `8cbf19c57352ad8aa2a8d08c01e48e7d9f76581f3d05c36e99264a4df8d43cd3`;
- privacy / terms / account-deletion URLs live;
- listing icon ready;
- feature graphic ready;
- listing/reviewer/Data Safety packet ready;
- physical-device screenshot kit ready.

Do not rebuild the Android binary merely because the Play developer account is created later.

## Owner-controlled sequence when work resumes

1. Owner confirms the legal publishing entity and whether registration should be Organization.
2. Check/obtain D-U-N-S for that exact entity.
3. Gather matching Turkey organization verification evidence and authorized-representative ID.
4. Choose the Google Account that will be the Play account owner.
5. Start Play Console signup and link/create the matching Organization Google Payments profile.
6. Verify email/phone and organization/identity information.
7. Stop at the one-time $25 payment until explicit owner approval is given.
8. After account activation, create the app record for `app.yekihast.mobile` and continue from `GOOGLE_PLAY_FINAL_PACKET.md`.

## Do not do

- Do not create a Personal account by default if the publisher is actually a business.
- Do not fabricate a legal entity or D-U-N-S value.
- Do not pay the registration fee without explicit approval.
- Do not upload identity documents into GitHub or chat.
- Do not put Play credentials/secrets in source.
- Do not touch Apple/iOS while the Android-first path is active.

## Official references

- Choose developer account type: https://support.google.com/googleplay/android-developer/answer/13634885
- Required Play developer account information: https://support.google.com/googleplay/android-developer/answer/13628312
- New Personal-account testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- Get started / one-time registration fee: https://support.google.com/googleplay/android-developer/answer/6112435
- Turkey verification documents: https://support.google.com/googleplay/android-developer/answer/15633622?co=GENIE.CountryCode%3DTR&hl=en
