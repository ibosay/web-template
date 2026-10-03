# Quiz Arena physical iPhone release test

This checklist is the required manual device test before the pull request can be considered ready for release.

## Test environment

1. Use the current app/quiz-capacitor branch.
2. Install the current native iOS build on a physical iPhone.
3. Test in portrait first, then repeat the layout checks in landscape.
4. Keep the app installed between tests so local persistence can be verified.

## Launch and navigation

1. Launch Quiz Arena from a fully closed state.
2. Confirm that the splash screen appears correctly.
3. Confirm that the home screen renders without clipped content.
4. Open each main navigation area.
5. Return to the home screen from Statistics and Achievements.
6. Confirm that the native back behavior does not unexpectedly close an active quiz.

## Safe area and rotation

1. Check the top area around the Dynamic Island or notch.
2. Check the bottom area around the home indicator.
3. Confirm that buttons and text remain fully visible.
4. Rotate from portrait to landscape on the home screen.
5. Rotate during an active quiz.
6. Rotate on the result screen.
7. Return to portrait and confirm that the layout recovers correctly.

## Full quiz round

1. Start with no category selected and confirm that Start remains unavailable.
2. Select one category and begin a round.
3. Answer at least one question correctly.
4. Answer at least one question incorrectly.
5. Confirm that answer feedback remains visible until Next is pressed.
6. Confirm that XP and progress update correctly.
7. Complete the round.
8. Confirm that the result screen shows the expected score and progress.
9. Return to the home screen without an error.

## Hard mode and joker

1. Start a Hard round.
2. Use the 50:50 joker.
3. Confirm that it can be used only once in that complete Hard round.
4. Give two wrong answers.
5. Confirm that the round ends after the second wrong answer.
6. Confirm that the wrong answer and correct answer remain visible before continuing.

## Persistence

1. Change one setting.
2. Complete part of a quiz.
3. Send the app to the background.
4. Wait briefly and reopen it.
5. Confirm that the app resumes without a blank screen or reset.
6. Fully close the app.
7. Reopen it.
8. Confirm that saved progress, statistics, achievements and settings remain available where expected.

## Core screens

Check all of these on the physical iPhone:

1. Home
2. Category selection
3. Question screen
4. Correct answer feedback
5. Wrong answer feedback
6. Result screen
7. Error training
8. Statistics
9. Achievements
10. Settings

## Pass condition

The physical iPhone blocker is complete only when all checks above pass with no release blocking defect.

Record the tested iPhone model, iOS version and any defect found before marking this blocker complete.
