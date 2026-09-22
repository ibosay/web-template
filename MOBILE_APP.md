# Quiz Arena Mobile App

Quiz Arena is packaged with Capacitor for iOS and Android.

## Current app experience

The native shell now uses the synchronized Quiz Arena V2 experience.

1. German and English are the two selectable UI languages.
2. The V2 local question bank contains 995 questions.
3. Categories are All, Islam Questions, General Knowledge, Geography, Science, History, EU and Citizenship Questions.
4. History is a parent learning section with four topics and 530 questions in total.
5. Easy and Hard difficulty modes are available.
6. Hard mode ends after the second wrong answer, but the current question remains visible until the player presses Next.
7. Round size, theme, font size, sound and haptics are persistent local settings.
8. There is no per-question countdown in the current V2 gameplay.
9. Player progress, XP, rounds, correct and wrong answers, best streak, Knowledge Stars, joker usage and rewards are stored locally.
10. Native Android back handling protects an active round and returns correctly from Statistics and Achievements.
11. Native Capacitor haptics are used on iOS and Android, with the browser vibration API as the web fallback.
12. The app uses safe area insets for mobile layouts.

## History learning section

History is no longer one flat category. It opens a topic selector with these pools:

1. World War I: 100 Easy, 50 Hard, 150 total.
2. World War II: 100 Easy, 50 Hard, 150 total.
3. Chechen History: 50 Easy, 30 Hard, 80 total.
4. Japanese History: 100 Easy, 50 Hard, 150 total.

Total History pool: 350 Easy, 180 Hard, 530 questions.

History questions are structured around chronology, places, causes, immediate consequences and historical significance. After an answer, the app displays a short learning explanation and a source. Japanese History deliberately focuses on political, social, military, economic and constitutional history rather than deity or idol quiz content.

## 50:50 joker

Knowledge Stars can be spent on the 50:50 joker, which removes two wrong answers.

In Hard mode the joker can be used only once for the entire round. After it has been used, later questions in the same Hard round show the joker as already used and it remains disabled. A new round resets this restriction.

## Achievements

The achievement collection contains 26 goals across Normal, Advanced, Hard and Legendary tiers. Achievement badges use a consistent SVG line-icon system instead of mixed emoji, text numbers and fraction symbols.

## Question mastery and rewards

* Answered questions are stored locally and do not repeat in consecutive rounds while unseen questions remain in the active pool.
* The final round of a cycle can be shorter than the selected round size so no seen question is recycled early.
* Completing an entire active pool perfectly awards a Golden Knowledge Chest, 500 bonus XP and 2 Knowledge Stars.
* 500 XP advances one level.
* Each level-up awards 1 Knowledge Star.
* Every fifth level also awards 2 extra Knowledge Stars and a level chest.
* Ranks progress through Beginner, Knowledgeable, Expert, Master, Grandmaster and Quiz Legend.
* Statistics opens a dedicated mobile detail page with lifetime performance and per-category question progress.
* Achievements opens a dedicated mobile detail page with unlocked and locked badges, descriptions, counters and progress bars.

## Citizenship Questions

The Citizenship Questions section is a parent category with two sourced topics: History of Austria with 97 questions from 10-001 through 10-097, and Vienna with 62 questions from 39-001 through 39-062. The parent category therefore contains 159 citizenship questions.

The separate legacy Austria category has been removed. The Culture category has also been removed. The category order starts with All, followed directly by Islam Questions.

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

The current bundle identifier is `at.ibosay.quiz`. The native display name is `Quiz Arena`.

## Splash screen

The app uses `@capacitor/splash-screen`. The current launch background is `#080D1C`, the spinner is disabled and the configured launch duration is 1200 ms. Final branded splash artwork is still required before store release.
