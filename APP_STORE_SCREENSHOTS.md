# Quiz Arena App Store screenshot plan

This plan reflects the current native iOS project configuration.

## Current supported Apple devices

The Xcode project currently uses:

TARGETED_DEVICE_FAMILY = "1,2"

This means the current build supports both iPhone and iPad.

Do not prepare only iPhone screenshots unless iPad support is intentionally removed from the release target first.

## Apple screenshot count

App Store Connect accepts a minimum of 1 and a maximum of 10 screenshots for each required device family and localization.

For the first German release, prepare 7 screenshots.

## iPhone screenshot set

Use the highest resolution required iPhone display set when possible.

Recommended current target:

6.9 inch iPhone display

Accepted portrait sizes include:

1260 x 2736 pixels

1290 x 2796 pixels

1320 x 2868 pixels

Use one accepted size consistently for the German screenshot set.

Screenshots must not contain an alpha channel or transparency.

## iPad screenshot set

Because the current app supports iPad, prepare the 13 inch iPad screenshot set.

Accepted portrait sizes include:

2064 x 2752 pixels

2048 x 2732 pixels

Use one accepted size consistently for the German screenshot set.

Screenshots must not contain an alpha channel or transparency.

## Screenshot order

Use the same story and order for iPhone and iPad.

### Screenshot 1

Screen: Home

Purpose: Show the Quiz Arena identity and the main learning categories.

Capture only after the final release candidate is installed.

### Screenshot 2

Screen: Category selection

Purpose: Show the range of subjects and the clear selection flow.

Use a state where no confusing temporary selection or debug element is visible.

### Screenshot 3

Screen: Active question

Purpose: Show the core quiz experience.

Use a clear educational question with short readable answers.

Avoid a controversial or unusually complex question for the first product screenshot.

### Screenshot 4

Screen: Correct answer feedback

Purpose: Show that Quiz Arena teaches after answering and does not only score the user.

Prefer a question with a useful learning explanation.

### Screenshot 5

Screen: Result and progression

Purpose: Show score, XP, level progress and Knowledge Stars.

Use a believable normal player state rather than an exaggerated artificial result.

### Screenshot 6

Screen: Error training

Purpose: Show that incorrectly answered questions can be practiced again.

The screen should contain at least one realistic mistake item.

### Screenshot 7

Screen: Statistics

Purpose: Show learning progress, performance and category analysis.

Use real test data generated inside the release candidate.

## Capture rules

1. Capture screenshots only from the final signed release candidate.
2. Prefer screenshots from the TestFlight build that passed the physical device checklist.
3. Do not include development menus, browser chrome, debugging overlays or simulator controls.
4. Do not include personal notifications or unrelated system content.
5. Make sure all text is legible and no buttons are clipped.
6. Verify safe areas before capture.
7. Keep orientation consistent within a screenshot set.
8. Do not stretch or distort screenshots to reach Apple's required dimensions.
9. Do not add transparency.
10. Do not present features that are not actually available in version 1.0.0.

## Localization

First required localization:

German

If additional App Store localizations are added later, review whether localized screenshots are needed.

Apple can reuse screenshots across localizations when appropriate, but the visible app text should match the marketed language wherever possible.

## Optional marketing treatment

For version 1.0.0, raw clean product screenshots are sufficient.

If framed marketing screenshots with headlines are created later, the underlying app state must still truthfully represent the released app.

Do not let marketing artwork hide important interface elements or imply unavailable functionality.

## App preview video

An App Store app preview video is optional.

Do not create one for version 1.0.0 unless the screenshot set is already complete and the release candidate is stable.

## Final screenshot gate

Do not upload final screenshots until:

1. The signed release candidate exists.
2. Physical iPhone testing passes.
3. Physical iPad or equivalent iPad validation has been completed if iPad support remains enabled.
4. TestFlight testing passes.
5. The app name and visual branding are final.
6. No release blocking layout defect remains.
