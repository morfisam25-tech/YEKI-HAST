# یکی هست — Store Platform Requirements

Last reviewed: 2026-09-04

This file records the time-sensitive platform requirements that must be checked before the first signed Store build.

## Google Play target API

Google Play requires new Android phone/tablet apps and app updates submitted from 2026-08-31 to target Android 16 / API level 36 or higher.

The committed mobile app currently uses Expo SDK 57 (`expo ~57.0.9`). Expo's SDK support table states SDK 57 uses Android `compileSdkVersion 36` and `targetSdkVersion 36`, so the current framework line is aligned with the Play requirement before the native signed build is created.

Do not downgrade Expo/React Native or override `targetSdkVersion` below 36 for the first Store build.

Official references:
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://docs.expo.dev/versions/latest/

## Apple SDK/Xcode upload requirement

Apple's current submission requirement states that apps uploaded to App Store Connect from 2026-04-28 must be built with Xcode 26 or later using the iOS 26 SDK or later.

Expo's SDK support table states SDK 57 uses Xcode 26.4+ and iOS 16.4+ as the minimum supported iOS version. The committed framework line is therefore positioned for the current Apple upload requirement, but the exact EAS build image/Xcode version must still be recorded from the signed build before submission.

Official references:
- https://developer.apple.com/news/upcoming-requirements/
- https://docs.expo.dev/versions/latest/

## Submission-day verification

For the exact signed release artifacts, record:

- Android build ID and generated versionCode;
- Android target SDK from the built artifact/build log: must be >= 36 under the current Play rule;
- iOS build ID and generated build number;
- Xcode version and iOS SDK used by EAS: must satisfy Apple's then-current upload requirement;
- exact Git commit SHA;
- Expo/EAS project ID;
- real-device smoke result.

If Store requirements change before submission, update this file and the release guard before building. Do not rely on a cached chat answer for time-sensitive Store policy.
