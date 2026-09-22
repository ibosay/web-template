# Quiz Arena Mobile App

Quiz Arena is packaged with Capacitor for iOS and Android.

## Current app experience

The native shell now uses the same Quiz Arena experience as the current live app.

1. German and English are the two selectable languages.
2. The local question bank contains 399 questions.
3. Categories include All, Islam, General Knowledge, Geography, Science, History, EU and a separate Citizenship Questions section.
4. Easy and Hard difficulty modes are available.
5. Round size, timer, theme, font size, sound and haptics are persistent local settings.
6. Player progress, XP, rounds, correct answers and best streak are stored locally.
7. Native Android back handling protects an active round.
8. The quiz timer pauses while the native app is inactive.
9. Native Capacitor haptics are used on iOS and Android, with the browser vibration API as the web fallback.
10. The app uses safe area insets for mobile layouts.

## Build and verification

Use Node 22.22 and Yarn 1.22.22.

1. Run `yarn install --frozen-lockfile`.
2. Run `yarn build-web`.
3. Run `npx cap sync android` and `npx cap sync ios`.
4. Build Android with `./gradlew assembleDebug` from the Android directory.
5. Build the iOS Simulator target with Xcode or `xcodebuild`.

The GitHub workflow `Mobile Foundation Verify` performs the automated web, Android and iOS verification for pull requests to main. The workflow is verification only and must not write generated files back into the pull request branch.

## Release checklist

Do not merge or call the store build finished until all required checks are satisfied.

1. Current live Quiz Arena behavior is synchronized into the repository.
2. Quiz tests and production web build are green.
3. Android and iOS Capacitor syncs are reproducible.
4. Android debug build is green.
5. iOS Simulator build and launch smoke test are green.
6. A complete round is tested on a real iPhone and a real Android device.
7. Rotation, safe areas, background and resume behavior are verified on real devices.
8. Final app icon and splash artwork are added.
9. Signing, bundle identifiers, version numbers and store metadata are finalized.
10. Signed App Store and Play Store release builds are produced.

The Citizenship Questions section is a parent category with two sourced topics: History of Austria with 97 questions from 10-001 through 10-097, and Vienna with 62 questions from 39-001 through 39-062. The parent category therefore contains 159 citizenship questions.

The current bundle identifier is `at.ibosay.quiz`. The native display name is `Quiz Arena`.

## Splash screen

The app uses `@capacitor/splash-screen`. The current launch background is `#080D1C`, the spinner is disabled and the configured launch duration is 1200 ms. Final branded splash artwork is still required before store release.


The separate legacy Austria category has been removed. Austrian citizenship content remains under Citizenship Questions, with History of Austria and Vienna as its two topics. Quiz Arena uses the vector brand logo on the home screen and settings drawer.


The Culture category has been removed together with its 20 questions. The category order starts with All, followed directly by Islam Questions.

Question mastery behavior:
* Answered questions are stored locally and do not repeat in consecutive rounds while unseen questions remain in the active pool.
* The final round of a cycle can be shorter than the selected round size so no seen question is recycled early.
* Completing an entire active pool perfectly awards a Golden Knowledge Chest, 500 bonus XP and 2 Knowledge Stars.
XP and reward progression:
* 500 XP advances one level.
* Each level-up awards 1 Knowledge Star.
* Every fifth level also awards 2 extra Knowledge Stars and a level chest.
* Knowledge Stars can be spent on a 50:50 joker that removes two wrong answers.
* Ranks progress through Beginner, Knowledgeable, Expert, Master, Grandmaster and Quiz Legend.
* Statistics opens a dedicated mobile detail page with rounds, correct and wrong answers, lifetime accuracy, XP, level, rank, stars, perfect runs, level chests, joker usage and per-category question progress.
* Achievements opens a dedicated mobile detail page with unlocked and locked badges, descriptions, counters and progress bars.
* Android back navigation returns from Statistics or Achievements to the main settings drawer before closing the drawer.