# Quiz Arena App Store privacy review

This document records the provisional privacy position for version 1.0.0 and the checks that must be repeated against the exact signed TestFlight build.

## Current implementation observed

1. Quiz Arena does not require a user account.
2. Quiz progress and settings are stored locally on the device.
3. The current QuizArenaLiveAppV2 implementation does not contain direct fetch calls.
4. No Sentry initialization or capture call was found in the current Quiz Arena screen.
5. The current iOS Privacy Manifest declares tracking disabled.
6. The current iOS Privacy Manifest declares no collected data types.
7. The current iOS Privacy Manifest declares no tracking domains.
8. The app can open external source links. Data handling on those external websites is governed by those third parties.

## Important dependency warning

The repository still contains inherited dependencies that are not part of the intended Quiz Arena player data flow, including Sentry packages and Sharetribe related packages.

The presence of a package in package.json does not by itself prove that data is collected.

Before submission, the exact signed build must be checked for initialization, transmission or runtime use of any third party SDK that could change the App Store privacy answers.

## Provisional App Store Connect position

Subject to final signed build verification, the intended answer is:

Data collected from this app: No

Tracking: No

Data linked to the user: No

This is not final until the TestFlight release candidate has been inspected.

## Privacy policy

Required privacy policy URL:

https://quiz-arena-zvgg8x.v2.appdeploy.ai/privacy.html

The policy must remain publicly accessible while the version is available.

## Final build checks

Perform these checks against the exact TestFlight candidate:

1. Confirm there is no user registration or login flow.
2. Confirm there is no advertising SDK.
3. Confirm there is no analytics or telemetry initialization.
4. Confirm there is no crash reporting initialization that transmits device or diagnostic data.
5. Confirm there is no remote player profile.
6. Confirm quiz progress remains local only.
7. Confirm no device identifier is transmitted by Quiz Arena.
8. Confirm no location, contacts, photos, camera, microphone or health data are accessed.
9. Confirm all native plugins actually included in the signed build.
10. Review every third party SDK included in the final binary against Apple privacy requirements.
11. Recheck the generated Privacy Manifest and any third party privacy manifests included in the archive.
12. Check network activity during cold launch, quiz play, results, statistics, achievements and background resume.
13. Update App Store Connect answers if any collected data is discovered.

## Local data currently expected

The following player state is expected to remain only on the device:

1. XP and level.
2. Knowledge Stars.
3. Answered question state.
4. Mistake training state.
5. Statistics.
6. Achievements.
7. Settings.
8. Local progress.

Local storage alone is not declared as collected data when it is not transmitted off the device.

## External links

Some quiz questions can link to external sources.

Opening an external website can cause the third party website or browser to process data independently.

The Quiz Arena privacy policy should continue to make this distinction clear.

## Verification record, 4 October 2026

1. Mobile Foundation Verify Run 156 completed successfully for commit e12bd1e44d1473b4c78a7d7ff6b8f762e380e5e2.
2. The deployed Quiz Arena application source was checked for direct Sentry initialization and none was found.
3. No direct fetch call was found in the deployed application source.
4. No Axios use was found in the deployed application source.
5. No XMLHttpRequest use was found in the deployed application source.
6. No analytics or gtag initialization was found in the deployed application source.
7. Local storage use remains present and is consistent with local player progress.
8. The verified Android release manifest contains INTERNET, VIBRATE and the app internal signature protected dynamic receiver permission.
9. This source and manifest review does not replace inspection of the exact signed TestFlight and Google Play release candidates.

## Submission gate

Do not finalize App Store privacy answers until:

1. The signed release candidate exists.
2. The candidate has been installed through TestFlight.
3. Runtime network behavior has been checked.
4. Third party SDK use has been reviewed.
5. Privacy policy wording still matches the exact release behavior.
