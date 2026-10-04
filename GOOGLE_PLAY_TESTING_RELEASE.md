# Quiz Arena Google Play testing and production access

This document prepares the testing path for Android version 1.0.0.

## First check

Determine the Google Play developer account type and creation date.

The additional production access testing requirement applies when both conditions are true:

1. The developer account is a personal account.
2. The account was created after 13 November 2023.

If the requirement does not apply, internal testing is still recommended before production.

## Internal testing

Use internal testing first.

Purpose:

1. Verify that the signed Android App Bundle is accepted by Google Play.
2. Install the Play distributed build on physical Android devices.
3. Check Play App Signing.
4. Check package name at.ibosay.quiz.
5. Check version code 1 and version name 1.0.0.
6. Verify launch icon and splash screen.
7. Complete one easy quiz round.
8. Complete one hard quiz round.
9. Verify the 50:50 joker.
10. Verify result and XP progression.
11. Verify Error Training.
12. Verify Statistics.
13. Verify Achievements.
14. Verify Settings persistence.
15. Verify background and resume.
16. Verify portrait and landscape layout.

## Closed testing requirement for new personal accounts

If the account is a personal developer account created after 13 November 2023:

1. Complete the Play Console app setup.
2. Create a closed testing track.
3. Add at least 12 real testers.
4. Ensure at least 12 testers remain opted in continuously for 14 consecutive days.
5. Keep the release available throughout the test period.
6. Ask testers to actually use the app and provide useful feedback.
7. Track defects and fixes during the test.
8. Do not remove testers during the required continuous period.
9. Keep more than 12 testers where practical so one tester leaving does not break the requirement.
10. After the requirement is met, apply for production access from Play Console.

Google can require additional testing if the tester requirement or tester engagement is considered insufficient.

## Tester instructions

Ask testers to verify:

1. Cold launch.
2. Category selection.
3. Easy round.
4. Hard round.
5. Correct answer feedback.
6. Wrong answer feedback.
7. Learning explanation and source.
8. 50:50 joker.
9. Results.
10. XP and level progression.
11. Error Training.
12. Statistics.
13. Achievements.
14. Settings.
15. Background and resume.
16. Screen rotation.
17. App close and reopen.
18. Any crash, blank screen, clipped button or unreadable text.

## Feedback record

Keep a simple record for production access:

1. Tester issue.
2. Device model.
3. Android version.
4. App version and version code.
5. Reproduction steps.
6. Severity.
7. Whether the issue was fixed.
8. Commit or build containing the fix.

Do not collect unnecessary personal information from testers.

## Production access application

If the closed testing requirement applies, expect Play Console to ask about:

1. How testers were recruited.
2. How the app was tested.
3. What feedback was received.
4. What changes were made from the feedback.
5. Why the app is ready for production.

Answer using the real testing results rather than generic statements.

## Open testing

Open testing is optional.

For new personal accounts subject to the production access requirement, open testing becomes available after production access is granted.

Quiz Arena version 1.0.0 does not need open testing if internal and required closed testing are sufficient.

## Production gate

Do not release to production until:

1. Store listing is complete.
2. Data Safety is final.
3. Content Rating is complete.
4. Target Audience is complete.
5. App Access is complete.
6. Privacy Policy is live.
7. Support contact is live.
8. Signed Android App Bundle is accepted.
9. Internal physical device testing passes.
10. Required closed testing is complete if it applies.
11. Production access has been granted if it was required.
12. No known release blocking defect remains.
