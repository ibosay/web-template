# Quiz Arena App Store submission draft

## App identity

App name: Quiz Arena

Bundle identifier: at.ibosay.quiz

Marketing version: 1.0.0

Initial build number: 1

Primary language: German

Suggested subtitle: Wissen. Spielen. Lernen.

Suggested primary category: Education

Possible secondary category: Games, Trivia

## Public URLs

Privacy policy:
https://quiz-arena-zvgg8x.v2.appdeploy.ai/privacy.html

Support:
https://quiz-arena-zvgg8x.v2.appdeploy.ai/support.html

Both pages must remain publicly reachable for the lifetime of the submitted version.

## Suggested German description

Quiz Arena verbindet klassisches Quizspielen mit persönlichem Lernfortschritt.

Spiele Fragen aus Allgemeinwissen, Geografie, Wissenschaft, Mathematik, Geschichte, EU, Staatsbürgerschaft und Islam. Wähle zwischen einfacher und schwerer Schwierigkeit, sammle XP und Wissenssterne und verbessere deine persönliche Bestserie.

Falsch beantwortete Fragen werden im Fehlertraining gesammelt. So kannst du gezielt die Fragen wiederholen, bei denen du noch unsicher bist. Deine Statistik zeigt deinen Fortschritt und hilft dir dabei, Stärken und Trainingsbereiche zu erkennen.

Quiz Arena benötigt kein Benutzerkonto. Der Spielstand wird in der aktuellen Version lokal auf deinem Gerät gespeichert.

Funktionen:
• mehrere Wissenskategorien
• einfache und schwere Runden
• Fehlertraining
• XP, Level und Wissenssterne
• 50:50 Joker
• Lernhinweise und Quellen bei geeigneten Fragen
• persönliche Statistik und Erfolge
• lokale Speicherung ohne Benutzerkonto

## Suggested keywords

quiz,wissen,lernen,geografie,geschichte,mathe,islam,eu,staatsbürgerschaft

Review byte length in App Store Connect before submission.

## App privacy draft

Current implementation:
No account.
No advertising SDK.
No analytics tracker.
No cloud player profile.
No personal profile data required for gameplay.
Game progress and settings are stored locally on the device.
External source links may open third party websites.

App Store Connect privacy answers must be rechecked against the final release build and every included third party SDK immediately before submission.

## Age rating review

Complete the current App Store Connect age rating questionnaire immediately before submission.

Pay particular attention to historical war content because the History section includes the First World War and Second World War. The final rating must be based on Apple's questionnaire rather than assumed in advance.

## Screenshots to prepare

Prepare clean iPhone screenshots that show:
1. Main Quiz Arena screen
2. Category selection
3. Question screen
4. Correct answer feedback
5. Result and level progress
6. Error training
7. Statistics and learning analysis

Use only screenshots from the final native build.

## Native store assets completed

The production iOS app icon and launch splash now use the existing Quiz Arena brand mark and dark app palette. Their SVG sources are versioned under store-assets, and the PNG files used by Xcode are generated reproducibly by GitHub Actions.

## Release blockers

1. Complete a full round on a physical iPhone.
2. Verify safe areas in portrait and landscape on a physical iPhone.
3. Verify background and resume behavior on a physical iPhone.
4. Test the final build on a physical Android device if Android ships with the same release.
5. Add a final public support contact method to the support page.
6. Configure Apple signing and the App Store Connect app record.
7. Produce a signed Archive build with the required current Xcode and iOS SDK.
8. Upload the build to App Store Connect and test it through TestFlight.
9. Capture final screenshots from the release candidate.
10. Complete age rating, content rights, privacy answers and all required metadata.
11. Submit only after the TestFlight candidate has no known release blocking defects.

## Release rule

Do not mark the pull request ready to merge and do not call version 1.0.0 store ready while any release blocker above remains open.
