# Quiz Arena Google Play Data Safety

This document prepares the Google Play Data safety declaration for Android version 1.0.0.

## Current intended declaration

Subject to final signed build verification:

Data collected: No

Data shared: No

Advertising: No

User account: No

Cloud player profile: No

## Current implementation basis

1. Quiz Arena does not require registration or login.
2. Quiz progress and settings are stored locally on the device.
3. Local on-device player state is not intended to leave the device.
4. The verified Android release manifest currently contains INTERNET and VIBRATE, plus the app internal signature protected dynamic receiver permission generated for at.ibosay.quiz.
5. The current CI rejects unexpected release permissions before the build is accepted.
6. No advertising SDK is intentionally used by Quiz Arena.
7. No analytics or telemetry initialization is intentionally used by Quiz Arena.
8. No cloud player profile is used.
9. No location, contacts, camera, microphone, photos, health or payment data are required for gameplay.
10. External source links can open third party websites.

## Important SDK review requirement

Google Play requires Data safety answers to include data transmitted by third party libraries and SDKs contained in the app.

The repository contains inherited dependencies that are not part of the intended Quiz Arena player data flow.

Before publishing, the exact signed Android App Bundle must be checked for runtime use of any SDK that could transmit:

1. Device or other identifiers.
2. Crash logs.
3. Diagnostics.
4. App interactions.
5. Approximate location inferred from network information.
6. Any other user or device data.

The presence of a dependency alone does not prove data collection, but actual runtime transmission must be declared.

## Local player data

The following data is expected to remain local only:

1. XP and level.
2. Knowledge Stars.
3. Answered question state.
4. Mistake training state.
5. Statistics.
6. Achievements.
7. Settings.
8. Local progress.

If this state remains only on device, it is not intended to be declared as collected user data.

## External links

Quiz Arena can open source links to third party websites.

The final build should open these as external web destinations rather than use them to collect Quiz Arena player data.

Third party websites have their own privacy practices.

## Privacy policy

Use:

https://quiz-arena-zvgg8x.v2.appdeploy.ai/privacy.html

The privacy policy must remain publicly accessible and must match the final Data safety answers.

## Final verification before Play Console submission

Check the exact signed release candidate:

1. Install the signed release build on a physical Android device.
2. Cold launch the app.
3. Complete an easy quiz round.
4. Complete a hard quiz round.
5. Open Statistics.
6. Open Achievements.
7. Change Settings.
8. Send the app to background and resume it.
9. Open an external source link.
10. Observe network activity during all steps.
11. Confirm no unexpected analytics, advertising, crash reporting or identifier transmission occurs.
12. Review all bundled third party SDKs.
13. Confirm Android permissions in the final merged manifest.
14. Confirm the privacy policy still matches actual behavior.
15. Update Google Play Data safety answers if any off-device data transmission is found.

## Provisional Play Console answers

Until the final signed build review proves otherwise:

Does the app collect or share any of the required user data types?

No

Does the app contain ads?

No

Does the app require an account?

No

Does the app allow account creation?

No

## Release gate

Do not submit the Data safety form as final until:

1. The signed Android App Bundle exists.
2. The signed build has been tested on a physical Android device.
3. Runtime network behavior has been inspected.
4. Third party SDK behavior has been reviewed.
5. Data safety answers and privacy policy are consistent.

## Verification record

On 4 October 2026, Mobile Foundation Verify Run 156 completed successfully for commit e12bd1e44d1473b4c78a7d7ff6b8f762e380e5e2.

The merged Android release manifest reported these permissions:

1. android.permission.INTERNET
2. android.permission.VIBRATE
3. at.ibosay.quiz.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION

The third permission is declared by the app as an internal signature protected permission. The CI release permission check passed with no unexpected permissions.
