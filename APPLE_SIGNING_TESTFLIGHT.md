# Quiz Arena Apple signing and TestFlight checklist

This checklist starts only after the App Store Connect app record exists and the Apple Developer Program account is ready.

## Fixed app identity

App name: Quiz Arena, subject to final availability confirmation in App Store Connect

Bundle identifier: at.ibosay.quiz

Marketing version: 1.0.0

Initial build number: 1

## Apple account prerequisites

1. Confirm that the Apple Developer Program membership is active.
2. Confirm that all required Apple agreements are accepted.
3. Confirm that the account has a role that can manage the app and upload builds.
4. Confirm that the explicit App ID matches at.ibosay.quiz.

## Signing approach

Preferred approach for the first release: Xcode automatic signing.

1. Open the iOS project in a currently supported Xcode version.
2. Select the App target.
3. Open Signing and Capabilities.
4. Select the correct Apple Developer team.
5. Enable automatic signing.
6. Confirm that the Bundle Identifier remains exactly at.ibosay.quiz.
7. Confirm that Xcode resolves a valid distribution signing configuration.
8. Do not change the marketing version or build number unless a new upload requires it.

If automatic signing cannot be used, create the required App Store Connect provisioning profile for the explicit App ID and the appropriate Apple Distribution certificate.

## Physical iPhone test before archive

Complete IOS_PHYSICAL_DEVICE_TEST.md before calling the release candidate ready.

Record:

1. iPhone model.
2. iOS version.
3. Quiz Arena version and build.
4. Result of the full quiz round.
5. Portrait and landscape safe area result.
6. Background and resume result.
7. Any release blocking defect.

## Create the release archive

1. Build the final production web bundle.
2. Run Capacitor sync for iOS.
3. Confirm that the iOS project remains reproducible.
4. Open the native iOS project in Xcode.
5. Select a generic iOS device destination suitable for archiving.
6. Choose Product, Archive.
7. Wait for the archive to appear in Xcode Organizer.
8. Run Xcode validation before upload.
9. Resolve every blocking validation error.
10. Do not upload a build whose Bundle Identifier, version or build number differs from the App Store Connect record.

## Upload to App Store Connect

1. Upload the validated archive using Xcode Organizer.
2. Wait for Apple to finish processing the build.
3. Confirm that the processed build appears under the expected app and version.
4. Confirm that the bundle identifier and version are associated with the correct App Store Connect record.
5. Review any Apple processing warnings before TestFlight distribution.

## TestFlight setup

1. Add the required beta app description.
2. Add a real feedback email address.
3. Add clear instructions describing what testers should verify.
4. Add the processed build to an internal testing group first.
5. Install the TestFlight build on the physical iPhone.
6. Repeat the release critical checks using the TestFlight build.
7. Confirm that local progress, settings, rotation, safe areas and background resume behave correctly.
8. Confirm that no release blocking crash, blank screen or navigation defect remains.
9. Use external testing only if needed after the internal test is clean.

## Suggested TestFlight test focus

Test the following in this order:

1. Cold launch.
2. Home screen.
3. Explicit category selection.
4. One complete easy round.
5. One complete hard round.
6. 50:50 joker behavior.
7. Wrong answer feedback.
8. Result and XP progression.
9. Error training.
10. Statistics.
11. Achievements.
12. Settings persistence.
13. Background and resume.
14. Portrait to landscape rotation and back.
15. Full app close and reopen.

## Build number rule

If a new binary is uploaded for the same marketing version after a defect is fixed, increase the build number before uploading the replacement build.

Example:

Version 1.0.0, build 1

Version 1.0.0, build 2

Version 1.0.0, build 3

## Release gate

Do not submit version 1.0.0 for App Review until all of these are true:

1. The physical iPhone checklist passes.
2. The signed archive validates successfully.
3. The build processes successfully in App Store Connect.
4. The TestFlight release candidate passes the critical checks.
5. The support URL contains real public contact information.
6. App privacy answers match the exact uploaded build.
7. Age rating and content rights are completed.
8. Final screenshots come from the release candidate.
9. There are no known release blocking defects.
