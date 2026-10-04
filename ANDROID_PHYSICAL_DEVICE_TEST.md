# Quiz Arena physical Android release test

This checklist is the required manual Android device test before version 1.0.0 can be considered ready for Google Play.

## Test environment

1. Use the current app/quiz-capacitor branch.
2. Build the current signed Android release candidate or install the Play distributed test build.
3. Record the device model, Android version, app version and version code.
4. Test portrait first, then repeat layout checks in landscape.
5. Keep the app installed between tests so local persistence can be verified.

## Install and launch

1. Install the release candidate.
2. Launch Quiz Arena from a fully closed state.
3. Confirm the launcher icon is correct.
4. Confirm the splash screen appears correctly.
5. Confirm the home screen renders without clipped content.
6. Confirm there is no blank screen, crash or unexpected browser chrome.

## Navigation and Android back behavior

1. Open every main navigation area.
2. Open Statistics and return.
3. Open Achievements and return.
4. Open Settings and return.
5. Start an active quiz.
6. Press the Android system back action.
7. Confirm an active round is protected from accidental exit as intended.
8. Confirm returning from detail screens does not close the app unexpectedly.

## Safe areas and rotation

1. Check the status bar area.
2. Check the navigation bar or gesture area.
3. Confirm buttons and text remain fully visible.
4. Rotate the home screen from portrait to landscape.
5. Rotate during an active quiz.
6. Rotate on the result screen.
7. Return to portrait and confirm the layout recovers correctly.

## Full quiz round

1. Start with no category selected and confirm Start remains unavailable.
2. Select one category and begin a round.
3. Answer at least one question correctly.
4. Answer at least one question incorrectly.
5. Confirm answer feedback remains visible until Next is pressed.
6. Confirm XP and progress update correctly.
7. Complete the round.
8. Confirm the result screen shows the expected score and progress.
9. Return to the home screen without an error.

## Hard mode and joker

1. Start a Hard round.
2. Use the 50:50 joker.
3. Confirm it can be used only once in the complete Hard round.
4. Give two wrong answers.
5. Confirm the round ends after the second wrong answer.
6. Confirm the wrong answer and correct answer remain visible before continuing.

## Persistence and lifecycle

1. Change one setting.
2. Complete part of a quiz.
3. Send the app to the background.
4. Wait briefly and reopen it.
5. Confirm the app resumes without a blank screen or reset.
6. Fully close the app.
7. Reopen it.
8. Confirm saved progress, statistics, achievements and settings remain available where expected.

## Haptics and external links

1. Confirm haptic feedback works on a supported device when enabled.
2. Disable haptics in Settings and confirm the preference is respected.
3. Open at least one external source link.
4. Confirm the external destination opens as intended.
5. Return to Quiz Arena and confirm the app resumes correctly.

## Permissions and privacy

1. Confirm the app does not request location.
2. Confirm the app does not request contacts.
3. Confirm the app does not request camera access.
4. Confirm the app does not request microphone access.
5. Confirm the app does not request photo library access.
6. Confirm no unexpected permission prompt appears during normal gameplay.
7. If possible, observe network traffic during launch, quiz play, results and background resume.
8. Confirm no unexpected analytics, advertising or identifier transmission is observed.

## Core screens

Check all of these on the physical Android device:

1. Home.
2. Category selection.
3. Question screen.
4. Correct answer feedback.
5. Wrong answer feedback.
6. Result screen.
7. Error training.
8. Statistics.
9. Achievements.
10. Settings.

## Google Play distributed build

If the app is installed from internal or closed testing in Google Play, additionally confirm:

1. Package name is at.ibosay.quiz.
2. Version name is 1.0.0.
3. Version code is 1 for the first uploaded build.
4. Play distributed installation completes successfully.
5. Play App Signing is configured as intended.
6. The Play delivered build behaves the same as the locally tested release candidate.

## Pass condition

The physical Android blocker is complete only when all applicable checks above pass with no release blocking defect.

Record every defect with device model, Android version, reproduction steps, severity and the build containing the fix.
