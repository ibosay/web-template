# Quiz Arena App Store Connect setup

This file records the values to use when creating the first iOS app record.

## Before creating the record

1. Confirm that the latest Apple Developer Program agreement is accepted.
2. Confirm that the Apple account has Account Holder, Admin or App Manager permission.
3. Check whether the localized App Store name Quiz Arena is available.
4. Do not create the record with a temporary name unless that name is intentionally accepted for the first submission.

## New App record

Platform: iOS

App name: Quiz Arena

Status of app name: Availability must be confirmed inside App Store Connect before creation because a different existing App Store app currently uses a very similar Quiz Arena name.

Primary language: German

Bundle ID: at.ibosay.quiz

Bundle ID rule: It must exactly match the Xcode project and must not be changed after a build is uploaded.

Suggested SKU: QUIZARENA_IOS_100

SKU note: The SKU is internal and not visible to customers. It cannot be changed after the app record is created.

User access: Full Access unless there is a specific reason to restrict the app to selected App Store Connect users.

## App information after creation

Marketing version: 1.0.0

Initial build number: 1

Suggested subtitle: Wissen. Spielen. Lernen.

Primary category: Education

Possible secondary category: Games, Trivia

Privacy policy URL: https://quiz-arena-zvgg8x.v2.appdeploy.ai/privacy.html

Support URL: https://quiz-arena-zvgg8x.v2.appdeploy.ai/support.html

Support URL blocker: Add real public contact information before App Store submission.

## App privacy

Current app owned implementation:

1. No user account.
2. No advertising SDK.
3. No analytics tracker initialized by Quiz Arena.
4. No cloud player profile.
5. Game progress and settings are stored locally on the device.
6. External source links can open third party websites.

Final App Store privacy answers must be checked against the exact signed TestFlight build and every bundled third party SDK.

## Age rating

Do not choose an age rating manually in advance.

Complete Apple's current age rating questionnaire based on the final release candidate.

Pay particular attention to historical war material in the First World War and Second World War question sets.

## Metadata still required before submission

1. Final app name availability confirmation.
2. Real support contact information.
3. Final description.
4. Final keywords within Apple's current byte limit.
5. Final screenshots captured from the signed release candidate.
6. Content rights answers.
7. Age rating questionnaire.
8. App privacy answers.
9. Availability and pricing.
10. Signed build uploaded through TestFlight.

## Creation rule

Do not create the App Store Connect record until the app name, Bundle ID and SKU values have been checked because the Bundle ID and SKU have restrictions after creation or build upload.
