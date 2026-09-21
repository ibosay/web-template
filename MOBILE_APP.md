# Quiz Arena Mobile App

Quiz Arena is packaged with Capacitor for iOS and Android.

## Current app experience

The native shell now uses the same Quiz Arena experience as the current live app.

1. German and English are the two selectable languages.
2. The local question bank contains 439 questions.
3. Categories include General Knowledge, Geography, Science, History, Culture, Austria, EU, Islam and a separate Citizenship Questions section, plus the combined All category.
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
